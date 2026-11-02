use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    response::IntoResponse,
};
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, RwLock};
use tracing::{error, info};

use super::iot_gateway::IoTGatewayService;

struct RunningWorker {
    conn_id: u64,
    stdin_tx: mpsc::UnboundedSender<String>,
    child_id: Option<u32>,
    stopped: Arc<std::sync::atomic::AtomicBool>,
}

#[derive(Clone)]
#[allow(clippy::type_complexity)]
pub struct SimulationWsManager {
    clients: Arc<RwLock<HashMap<String, (u64, mpsc::UnboundedSender<String>)>>>,
    workers: Arc<RwLock<HashMap<String, RunningWorker>>>,
    next_conn_id: Arc<std::sync::atomic::AtomicU64>,
    gateway: Arc<IoTGatewayService>,
}

fn is_real_error_line(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() {
        return false;
    }
    // Benign / informational lines printed by worker or QEMU
    if t.starts_with("[mcu-maker-worker]") {
        return false;
    }
    if t.contains("Adding SPI flash device") {
        return false;
    }
    if t.contains("Taking exception") {
        return false;
    }
    if t.contains("info:") {
        return false;
    }
    if t.contains("warning:") && !t.contains("error:") {
        return false;
    }
    true
}

impl SimulationWsManager {
    pub fn new(gateway: Arc<IoTGatewayService>) -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            workers: Arc::new(RwLock::new(HashMap::new())),
            next_conn_id: Arc::new(std::sync::atomic::AtomicU64::new(1)),
            gateway,
        }
    }

    pub async fn stop_worker(&self, client_id: &str) {
        let mut workers = self.workers.write().await;
        if let Some(worker) = workers.remove(client_id) {
            worker.stopped.store(true, std::sync::atomic::Ordering::SeqCst);
            let _ = worker.stdin_tx.send("{\"cmd\":\"stop\"}\n".to_string());
            if let Some(pid) = worker.child_id {
                kill_process_tree(pid);
            }
        }
        self.gateway.unregister(client_id).await;
    }
}

pub async fn handle_simulation_ws(
    ws: WebSocketUpgrade,
    Path(client_id): Path<String>,
    State(mgr): State<Arc<SimulationWsManager>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, client_id, mgr))
}

/// Native worker executable name (`.exe` only on Windows).
const WORKER_BIN: &str = if cfg!(windows) { "mcu-maker-worker.exe" } else { "mcu-maker-worker" };
/// QEMU runtime libraries loaded by the worker (`.dll` on Windows, `.so` on Linux).
const QEMU_XTENSA_LIB: &str = if cfg!(windows) { "libqemu-xtensa.dll" } else { "libqemu-xtensa.so" };
const QEMU_RISCV_LIB: &str = if cfg!(windows) { "libqemu-riscv32.dll" } else { "libqemu-riscv32.so" };

/// Kills a worker process (and its children) in a platform-appropriate way.
fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();
    }
}

fn resolve_paths() -> (Option<PathBuf>, Option<PathBuf>, Option<PathBuf>) {
    let mut check_dirs = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        check_dirs.push(cwd);
    }
    if let Ok(cur_exe) = std::env::current_exe() {
        if let Some(p) = cur_exe.parent() {
            check_dirs.push(p.to_path_buf());
        }
    }

    let mut repo_root = PathBuf::from(".");
    for dir in &check_dirs {
        let mut curr = Some(dir.as_path());
        while let Some(p) = curr {
            if p.join("rust").join("Cargo.toml").is_file() || p.join("prebuilt").join("qemu_runtime").is_dir() {
                repo_root = p.to_path_buf();
                break;
            }
            curr = p.parent();
        }
        if repo_root != std::path::Path::new(".") {
            break;
        }
    }

    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf()));

    // 1. Resolve mcu-maker-worker binary
    let mut rust_worker = None;
    if let Some(ref dir) = exe_dir {
        let candidate = dir.join(WORKER_BIN);
        if candidate.is_file() {
            rust_worker = Some(candidate);
        }
    }
    if rust_worker.is_none() {
        for candidate in [
            repo_root.join("rust").join("target").join("release").join(WORKER_BIN),
            repo_root.join("target").join("release").join(WORKER_BIN),
            repo_root.join("rust").join("target").join("debug").join(WORKER_BIN),
            repo_root.join("target").join("debug").join(WORKER_BIN),
            repo_root.join(WORKER_BIN),
        ] {
            if candidate.is_file() {
                rust_worker = Some(candidate);
                break;
            }
        }
    }

    // 2. Resolve QEMU DLLs (Xtensa and RISC-V)
    let find_dll = |filename: &str| -> Option<PathBuf> {
        let mut candidates = Vec::new();
        if let Some(ref dir) = exe_dir {
            candidates.push(dir.join(filename));
            candidates.push(dir.join("qemu_runtime").join(filename));
            candidates.push(dir.join("prebuilt").join("qemu_runtime").join(filename));
            candidates.push(dir.join("prebuilt").join("qemu_runtime_linux").join(filename));
        }
        candidates.push(repo_root.join("prebuilt").join("qemu_runtime").join(filename));
        candidates.push(repo_root.join("prebuilt").join("qemu_runtime_linux").join(filename));
        candidates.push(repo_root.join("prebuilt").join("picsimlab").join("picsimlab_win64").join("lib").join("qemu").join(filename));
        candidates.push(repo_root.join("prebuilt").join("picsimlab").join("picsimlab_linux64").join("lib").join("qemu").join(filename));
        candidates.push(repo_root.join("rust").join("target").join("release").join(filename));
        candidates.push(repo_root.join(filename));

        candidates.into_iter().find(|c| c.is_file())
    };

    let xtensa_dll = find_dll(QEMU_XTENSA_LIB);
    let riscv_dll = find_dll(QEMU_RISCV_LIB);

    (rust_worker, xtensa_dll, riscv_dll)
}

fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(8080)
}

#[allow(clippy::too_many_arguments)]
async fn spawn_worker_instance(
    conn_id: u64,
    cid: &str,
    board: &str,
    wifi_enabled: bool,
    sensors: &serde_json::Value,
    bus_map: &serde_json::Value,
    firmware_b64: &str,
    mgr: &Arc<SimulationWsManager>,
    gateway: &Arc<IoTGatewayService>,
    ws_tx: &mpsc::UnboundedSender<String>,
) {
    mgr.stop_worker(cid).await;

    let wifi_hostfwd_port = if wifi_enabled {
        find_free_port()
    } else {
        0
    };

    if wifi_enabled && wifi_hostfwd_port > 0 {
        gateway.register(
            cid.to_string(),
            wifi_hostfwd_port,
            "192.168.4.15".to_string(),
            format!("ESP32 Web Server (HTTP :80 -> :{})", wifi_hostfwd_port),
        ).await;
    }

    let (rust_worker, xtensa_dll, riscv_dll) = resolve_paths();
    let is_riscv = board.contains("c3") || board.contains("supermini");
    let lib_opt = if is_riscv { riscv_dll } else { xtensa_dll };
    let machine = if is_riscv {
        "esp32c3-picsimlab"
    } else if board.contains("s3") {
        "esp32s3"
    } else {
        "esp32-picsimlab"
    };

    let worker_bin = match rust_worker {
        Some(bin) => bin,
        None => {
            error!("Native Rust ESP32 worker binary (mcu-maker-worker) not found!");
            let _ = ws_tx.send(serde_json::json!({
                "type": "error",
                "data": { "message": "Worker nativo Rust mcu-maker-worker no encontrado. Compile con: cargo build --release -p mcu-maker-worker" }
            }).to_string());
            return;
        }
    };

    let lib_path = match lib_opt {
        Some(p) if p.is_file() => p,
        _ => {
            let target_name = if is_riscv { QEMU_RISCV_LIB } else { QEMU_XTENSA_LIB };
            error!("QEMU library {:?} not found in prebuilt/qemu_runtime or binary directories!", target_name);
            let _ = ws_tx.send(serde_json::json!({
                "type": "error",
                "data": { "message": format!("Librería de simulación {} no encontrada en prebuilt/qemu_runtime.", target_name) }
            }).to_string());
            return;
        }
    };

    info!("Launching 100% native Rust ESP32 worker: bin={:?}, machine={}, lib={:?}", worker_bin, machine, lib_path);
    let mut cmd = Command::new(worker_bin);

    #[cfg(unix)]
    {
        if let Some(dir) = lib_path.parent() {
            let mut ld = dir.as_os_str().to_os_string();
            if let Some(prev) = std::env::var_os("LD_LIBRARY_PATH") {
                ld.push(":");
                ld.push(prev);
            }
            cmd.env("LD_LIBRARY_PATH", ld);
        }
    }

    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    match cmd.spawn() {
        Ok(mut child) => {
            let child_pid = child.id();
            let mut stdin = child.stdin.take().unwrap();
            let stdout = child.stdout.take().unwrap();
            let stderr = child.stderr.take().unwrap();

            let (worker_in_tx, mut worker_in_rx) = mpsc::unbounded_channel::<String>();
            let stopped = Arc::new(std::sync::atomic::AtomicBool::new(false));
            let stopped_for_worker = stopped.clone();

            {
                let mut workers = mgr.workers.write().await;
                workers.insert(cid.to_string(), RunningWorker {
                    conn_id,
                    stdin_tx: worker_in_tx,
                    child_id: child_pid,
                    stopped: stopped_for_worker,
                });
            }

            // Send initial configuration on stdin
            let config = serde_json::json!({
                "lib_path": lib_path.to_string_lossy(),
                "firmware_b64": firmware_b64,
                "machine": machine,
                "sensors": sensors,
                "wifi_enabled": wifi_enabled,
                "wifi_hostfwd_port": wifi_hostfwd_port,
                "bus_map": bus_map,
            });

            let config_line = format!("{}\n", config);
            let _ = stdin.write_all(config_line.as_bytes()).await;
            let _ = stdin.flush().await;

            // Task to forward commands to worker stdin
            tokio::spawn(async move {
                while let Some(line) = worker_in_rx.recv().await {
                    if stdin.write_all(line.as_bytes()).await.is_err() {
                        break;
                    }
                    let _ = stdin.flush().await;
                }
            });

            let last_stderr = Arc::new(tokio::sync::Mutex::new(Vec::<String>::new()));
            let last_stderr_clone = last_stderr.clone();

            // Task to log stderr
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    info!("[esp32_worker stderr] {}", line);
                    if is_real_error_line(&line) {
                        let mut errs = last_stderr_clone.lock().await;
                        if errs.len() > 10 {
                            errs.remove(0);
                        }
                        errs.push(line);
                    }
                }
            });

            // Task to read stdout and dispatch to WebSocket
            let ws_tx_clone = ws_tx.clone();
            let last_stderr_for_stdout = last_stderr.clone();
            let stopped_clone = stopped.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout);
                let mut line = String::new();
                let mut uart_buf: Vec<u8> = Vec::new();

                loop {
                    line.clear();
                    let read_fut = reader.read_line(&mut line);
                    match tokio::time::timeout(std::time::Duration::from_millis(40), read_fut).await {
                        Ok(Ok(0)) => {
                            info!("Worker stdout reached EOF");
                            if !uart_buf.is_empty() {
                                let text = String::from_utf8_lossy(&uart_buf).to_string();
                                let b64 = base64::engine::general_purpose::STANDARD.encode(&uart_buf);
                                uart_buf.clear();

                                let out_msg = serde_json::json!({
                                    "type": "serial_output",
                                    "data": {
                                        "data": text,
                                        "uart": 0,
                                        "b64": b64,
                                    }
                                });
                                let _ = ws_tx_clone.send(out_msg.to_string());
                            }
                            // Only report an error if the worker was not intentionally stopped
                            if !stopped_clone.load(std::sync::atomic::Ordering::SeqCst) {
                                let errs = last_stderr_for_stdout.lock().await;
                                if let Some(last) = errs.last() {
                                    let err_msg = format!("El simulador finalizó: {}", last);
                                    let _ = ws_tx_clone.send(serde_json::json!({
                                        "type": "error",
                                        "data": { "message": err_msg }
                                    }).to_string());
                                }
                            }
                            break;
                        }
                        Ok(Ok(_)) => {
                            let trimmed = line.trim();
                            if let Some(idx) = trimmed.find('{') {
                                let json_part = &trimmed[idx..];
                                if let Ok(event) = serde_json::from_str::<serde_json::Value>(json_part) {
                                    let etype = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

                                    if etype == "uart_tx" {
                                        let uart_id = event.get("uart").and_then(|u| u.as_u64()).unwrap_or(0);
                                        let byte_val = event.get("byte").and_then(|b| b.as_u64()).unwrap_or(0) as u8;
                                        uart_buf.push(byte_val);

                                        let should_flush = byte_val == b'\n'
                                            || byte_val == b'\r'
                                            || byte_val == b'.'
                                            || byte_val == 0x04
                                            || uart_buf.len() >= 128;

                                        if should_flush {
                                            let text = String::from_utf8_lossy(&uart_buf).to_string();
                                            let b64 = base64::engine::general_purpose::STANDARD.encode(&uart_buf);
                                            uart_buf.clear();

                                            let out_msg = serde_json::json!({
                                                "type": "serial_output",
                                                "data": {
                                                    "data": text,
                                                    "uart": uart_id,
                                                    "b64": b64,
                                                }
                                            });
                                            let _ = ws_tx_clone.send(out_msg.to_string());
                                        }
                                    } else {
                                        // Pass through other events directly (gpio_change, system, ledc_duty, etc.)
                                        let mut event_data = event.clone();
                                        if let Some(obj) = event_data.as_object_mut() {
                                            obj.remove("type");
                                        }
                                        let out_msg = serde_json::json!({
                                            "type": etype,
                                            "data": event_data
                                        });
                                        let _ = ws_tx_clone.send(out_msg.to_string());
                                    }
                                }
                            }
                        }
                        Ok(Err(e)) => {
                            error!("Error reading worker stdout: {}", e);
                            break;
                        }
                        Err(_) => {
                            // Timeout expired: if we have buffered UART bytes, flush them!
                            if !uart_buf.is_empty() {
                                let text = String::from_utf8_lossy(&uart_buf).to_string();
                                let b64 = base64::engine::general_purpose::STANDARD.encode(&uart_buf);
                                uart_buf.clear();

                                let out_msg = serde_json::json!({
                                    "type": "serial_output",
                                    "data": {
                                        "data": text,
                                        "uart": 0,
                                        "b64": b64,
                                    }
                                });
                                let _ = ws_tx_clone.send(out_msg.to_string());
                            }
                        }
                    }
                }
            });
        }
        Err(e) => {
            error!("Failed to spawn esp32_worker: {}", e);
            let _ = ws_tx.send(serde_json::json!({
                "type": "error",
                "data": { "message": format!("Worker launch failed: {}", e) }
            }).to_string());
        }
    }
}

async fn handle_socket(socket: WebSocket, client_id: String, mgr: Arc<SimulationWsManager>) {
    let conn_id = mgr.next_conn_id.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let (mut sender, mut receiver) = socket.split();
    let (ws_tx, mut ws_rx) = mpsc::unbounded_channel::<String>();

    {
        let mut clients = mgr.clients.write().await;
        clients.insert(client_id.clone(), (conn_id, ws_tx.clone()));
    }
    info!("Simulation WebSocket connected for client: {} (conn_id: {})", client_id, conn_id);

    // Forward outgoing messages to websocket
    let forward_task = tokio::spawn(async move {
        while let Some(msg) = ws_rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    let cid = client_id.clone();
    let gateway = mgr.gateway.clone();
    let mgr_clone = mgr.clone();

    let mut session_board = "esp32".to_string();
    let mut session_wifi = false;
    let mut session_sensors = serde_json::json!([]);
    let mut session_bus_map = serde_json::json!({});
    let mut session_firmware_b64 = String::new();

    // Process incoming messages
    while let Some(Ok(msg)) = receiver.next().await {
        if let Message::Text(text) = msg {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                let msg_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");
                let data = val.get("data").cloned().unwrap_or(serde_json::json!({}));

                match msg_type {
                    "start_esp32" => {
                        session_board = data.get("board").and_then(|b| b.as_str()).unwrap_or("esp32").to_string();
                        session_wifi = data.get("wifi_enabled").and_then(|w| w.as_bool()).unwrap_or(false);
                        session_sensors = data.get("sensors").cloned().unwrap_or(serde_json::json!([]));
                        session_bus_map = data.get("bus_map").cloned().unwrap_or(serde_json::json!({}));
                        let firmware_b64 = data.get("firmware_b64").and_then(|f| f.as_str()).unwrap_or("");

                        if !firmware_b64.is_empty() {
                            session_firmware_b64 = firmware_b64.to_string();
                            spawn_worker_instance(
                                conn_id,
                                &cid,
                                &session_board,
                                session_wifi,
                                &session_sensors,
                                &session_bus_map,
                                firmware_b64,
                                &mgr_clone,
                                &gateway,
                                &ws_tx,
                            ).await;
                        } else {
                            info!("start_esp32 received without firmware for {}; waiting for load_firmware", cid);
                        }
                    }
                    "load_firmware" => {
                        if let Some(b) = data.get("board").and_then(|b| b.as_str()) {
                            session_board = b.to_string();
                        }
                        let firmware_b64 = data.get("firmware_b64").and_then(|f| f.as_str()).unwrap_or("");
                        if !firmware_b64.is_empty() {
                            let already_running = {
                                let workers = mgr_clone.workers.read().await;
                                workers.contains_key(&cid)
                            };
                            if already_running && session_firmware_b64 == firmware_b64 {
                                info!("load_firmware for {} matches already running firmware, skipping duplicate launch", cid);
                            } else {
                                session_firmware_b64 = firmware_b64.to_string();
                                info!("load_firmware received for {}, launching worker (size: {} chars)", cid, firmware_b64.len());
                                spawn_worker_instance(
                                    conn_id,
                                    &cid,
                                    &session_board,
                                    session_wifi,
                                    &session_sensors,
                                    &session_bus_map,
                                    firmware_b64,
                                    &mgr_clone,
                                    &gateway,
                                    &ws_tx,
                                ).await;
                            }
                        }
                    }
                    "stop_esp32" => {
                        mgr_clone.stop_worker(&cid).await;
                    }
                    "esp32_serial_input" => {
                        let bytes = data.get("bytes").and_then(|b| b.as_array());
                        let uart = data.get("uart").and_then(|u| u.as_u64()).unwrap_or(0);
                        if let Some(byte_array) = bytes {
                            let raw_bytes: Vec<u8> = byte_array.iter().filter_map(|v| v.as_u64().map(|n| n as u8)).collect();
                            let b64 = base64::engine::general_purpose::STANDARD.encode(&raw_bytes);
                            let cmd = serde_json::json!({
                                "cmd": "uart_send",
                                "uart": uart,
                                "data": b64,
                            });
                            let workers = mgr_clone.workers.read().await;
                            if let Some(w) = workers.get(&cid) {
                                let _ = w.stdin_tx.send(format!("{}\n", cmd));
                            }
                        }
                    }
                    "esp32_gpio_in" => {
                        let pin = data.get("pin").and_then(|p| p.as_i64()).unwrap_or(0);
                        let state = data.get("state").and_then(|s| s.as_i64()).unwrap_or(0);
                        let cmd = serde_json::json!({
                            "cmd": "set_pin",
                            "pin": pin,
                            "value": state,
                        });
                        let workers = mgr_clone.workers.read().await;
                        if let Some(w) = workers.get(&cid) {
                            let _ = w.stdin_tx.send(format!("{}\n", cmd));
                        }
                    }
                    "esp32_adc_set" => {
                        let channel = data.get("channel").and_then(|c| c.as_i64()).unwrap_or(0);
                        let mv = data.get("millivolts").and_then(|m| m.as_i64());
                        let raw = data.get("raw").and_then(|r| r.as_i64());
                        let cmd = if let Some(millivolts) = mv {
                            serde_json::json!({
                                "cmd": "set_adc",
                                "channel": channel,
                                "millivolts": millivolts,
                            })
                        } else if let Some(raw_val) = raw {
                            serde_json::json!({
                                "cmd": "set_adc_raw",
                                "channel": channel,
                                "raw": raw_val,
                            })
                        } else {
                            serde_json::json!({})
                        };
                        let workers = mgr_clone.workers.read().await;
                        if let Some(w) = workers.get(&cid) {
                            let _ = w.stdin_tx.send(format!("{}\n", cmd));
                        }
                    }
                    "ping" => {
                        let _ = ws_tx.send(serde_json::json!({ "type": "pong" }).to_string());
                    }
                    "start_pi" => {
                        let pi_board = data.get("board").and_then(|b| b.as_str()).unwrap_or("raspberry-pi-3");
                        let err_msg = serde_json::json!({
                            "type": "error",
                            "data": {
                                "message": format!("La simulación de {} requiere qemu-system-aarch64 e imágenes de kernel Linux (boot_images) que no están presentes en esta instalación.", pi_board)
                            }
                        });
                        let _ = ws_tx.send(err_msg.to_string());
                        let serial_msg = serde_json::json!({
                            "type": "serial_output",
                            "data": {
                                "data": format!("\r\n[MCU Maker] {}: Simulación de Raspberry Pi OS suspendida. Se requieren imágenes de arranque del sistema AArch64.\r\n", pi_board)
                            }
                        });
                        let _ = ws_tx.send(serial_msg.to_string());
                    }
                    "stop_pi" => {
                        // Cleanly acknowledge stop_pi
                    }
                    _ => {
                        // Forward arbitrary bus/sensor messages to worker
                        let workers = mgr_clone.workers.read().await;
                        if let Some(w) = workers.get(&cid) {
                            let mut pass_through = data.clone();
                            if let Some(obj) = pass_through.as_object_mut() {
                                obj.insert("cmd".to_string(), serde_json::Value::String(msg_type.to_string()));
                            }
                            let _ = w.stdin_tx.send(format!("{}\n", pass_through));
                        }
                    }
                }
            }
        }
    }

    forward_task.abort();
    {
        let mut workers = mgr_clone.workers.write().await;
        if let Some(w) = workers.get(&client_id) {
            if w.conn_id == conn_id {
                if let Some(worker) = workers.remove(&client_id) {
                    worker.stopped.store(true, std::sync::atomic::Ordering::SeqCst);
                    let _ = worker.stdin_tx.send("{\"cmd\":\"stop\"}\n".to_string());
                    if let Some(pid) = worker.child_id {
                        kill_process_tree(pid);
                    }
                }
                mgr_clone.gateway.unregister(&client_id).await;
            }
        }
    }
    {
        let mut clients = mgr.clients.write().await;
        if let Some((owner_id, _)) = clients.get(&client_id) {
            if *owner_id == conn_id {
                clients.remove(&client_id);
            }
        }
    }
    info!("Simulation WebSocket disconnected for client: {} (conn_id: {})", client_id, conn_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_paths_finds_qemu_libraries() {
        let (_worker, xtensa, riscv) = resolve_paths();
        assert!(xtensa.is_some(), "libqemu-xtensa should be found in prebuilt/qemu_runtime");
        assert!(riscv.is_some(), "libqemu-riscv32 should be found in prebuilt/qemu_runtime");
        let xtensa_path = xtensa.unwrap();
        let riscv_path = riscv.unwrap();
        assert!(xtensa_path.is_file(), "xtensa path {:?} does not exist", xtensa_path);
        assert!(riscv_path.is_file(), "riscv path {:?} does not exist", riscv_path);
    }
}
