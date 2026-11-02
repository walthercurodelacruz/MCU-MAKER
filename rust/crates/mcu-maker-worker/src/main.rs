use std::ffi::CString;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use base64::Engine;
use serde::Deserialize;

/// Platform layer: everything that differs between Windows and Linux lives here.
/// Both variants expose the same two functions so the rest of the worker is
/// platform-neutral.
///
/// * `set_dll_directory` – make QEMU's sibling shared libraries resolvable.
/// * `take_stdio` – keep private duplicates of the original stdin/stdout (our JSON
///   pipe to the server) and point fd 0/1 at the null device so QEMU's own stdio
///   multiplexer cannot corrupt that pipe.
#[cfg(windows)]
mod sys {
    use std::io::{self, Read, Write};
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::FromRawHandle;
    use std::path::Path;

    #[link(name = "kernel32")]
    extern "system" {
        fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
        fn GetStdHandle(nStdHandle: u32) -> isize;
        fn SetStdHandle(nStdHandle: u32, hHandle: isize) -> i32;
        fn GetCurrentProcess() -> isize;
        fn DuplicateHandle(
            hSourceProcessHandle: isize,
            hSourceHandle: isize,
            hTargetProcessHandle: isize,
            lpTargetHandle: *mut isize,
            dwDesiredAccess: u32,
            bInheritHandle: i32,
            dwOptions: u32,
        ) -> i32;
        fn WriteFile(
            hFile: isize,
            lpBuffer: *const u8,
            nNumberOfBytesToWrite: u32,
            lpNumberOfBytesWritten: *mut u32,
            lpOverlapped: *mut (),
        ) -> i32;
    }

    #[link(name = "msvcrt")]
    extern "C" {
        fn _dup(fd: i32) -> i32;
        fn _dup2(src: i32, dst: i32) -> i32;
        fn _open(filename: *const i8, oflag: i32) -> i32;
        fn _close(fd: i32) -> i32;
        fn _get_osfhandle(fd: i32) -> isize;
    }

    struct HandleWriter(isize);
    // A duplicated stdout HANDLE is a plain kernel handle: safe to use from any thread.
    unsafe impl Send for HandleWriter {}

    impl Write for HandleWriter {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            let mut written = 0u32;
            let ok = unsafe {
                WriteFile(self.0, buf.as_ptr(), buf.len() as u32, &mut written, std::ptr::null_mut())
            };
            if ok == 0 || written == 0 {
                // Handle closed or broken pipe
                Err(io::Error::new(io::ErrorKind::BrokenPipe, "stdout handle closed"))
            } else {
                Ok(written as usize)
            }
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    pub fn set_dll_directory(dir: &Path) {
        let wide: Vec<u16> = dir.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        unsafe {
            SetDllDirectoryW(wide.as_ptr());
        }
    }

    pub fn take_stdio() -> (Box<dyn Read + Send>, Box<dyn Write + Send>) {
        let orig_stdin_fd = unsafe { _dup(0) };
        let raw_stdout = unsafe { GetStdHandle(0xFFFFFFF5) };
        let mut dup_stdout: isize = -1;
        unsafe {
            let cur_proc = GetCurrentProcess();
            DuplicateHandle(
                cur_proc,
                raw_stdout,
                cur_proc,
                &mut dup_stdout,
                0,
                0,
                2, // DUPLICATE_SAME_ACCESS
            );
        }
        eprintln!("[mcu-maker-worker] raw_stdout = {}, dup_stdout = {}", raw_stdout, dup_stdout);

        // Redirect fd 0 and fd 1 to NUL to protect QEMU stdio mux from corrupting our JSON pipe
        unsafe {
            let nul_r = _open(b"NUL\0".as_ptr() as *const i8, 0);
            if nul_r >= 0 {
                let nul_r_os = _get_osfhandle(nul_r);
                SetStdHandle(0xFFFFFFF6, nul_r_os);
                _dup2(nul_r, 0);
                _close(nul_r);
            }
            let nul_w = _open(b"NUL\0".as_ptr() as *const i8, 1);
            if nul_w >= 0 {
                let nul_w_os = _get_osfhandle(nul_w);
                SetStdHandle(0xFFFFFFF5, nul_w_os);
                _dup2(nul_w, 1);
                _close(nul_w);
            }
        }

        let reader = unsafe {
            let os_handle = _get_osfhandle(orig_stdin_fd) as std::os::windows::raw::HANDLE;
            std::fs::File::from_raw_handle(os_handle)
        };
        (Box::new(reader), Box::new(HandleWriter(dup_stdout)))
    }
}

#[cfg(unix)]
mod sys {
    use std::fs::File;
    use std::io::{Read, Write};
    use std::os::raw::{c_char, c_int};
    use std::os::unix::io::FromRawFd;
    use std::path::Path;

    // These symbols come from libc, which std already links on Linux.
    extern "C" {
        fn dup(fd: c_int) -> c_int;
        fn dup2(src: c_int, dst: c_int) -> c_int;
        fn open(path: *const c_char, flags: c_int, ...) -> c_int;
        fn close(fd: c_int) -> c_int;
    }

    const O_RDONLY: c_int = 0;
    const O_WRONLY: c_int = 1;

    /// No-op on Linux: the dynamic loader resolves QEMU's sibling libraries through
    /// `LD_LIBRARY_PATH`, which the server sets when it spawns this worker.
    pub fn set_dll_directory(_dir: &Path) {}

    pub fn take_stdio() -> (Box<dyn Read + Send>, Box<dyn Write + Send>) {
        unsafe {
            let orig_stdin = dup(0);
            let orig_stdout = dup(1);

            // Redirect fd 0 and fd 1 to /dev/null to protect QEMU stdio mux from corrupting our JSON pipe
            let nul_r = open(b"/dev/null\0".as_ptr() as *const c_char, O_RDONLY);
            if nul_r >= 0 {
                dup2(nul_r, 0);
                close(nul_r);
            }
            let nul_w = open(b"/dev/null\0".as_ptr() as *const c_char, O_WRONLY);
            if nul_w >= 0 {
                dup2(nul_w, 1);
                close(nul_w);
            }

            (
                Box::new(File::from_raw_fd(orig_stdin)),
                Box::new(File::from_raw_fd(orig_stdout)),
            )
        }
    }
}

enum WorkerEvent {
    UartTx { uart: u8, byte: u8 },
    GpioChange { pin: i32, state: i32 },
    GpioDir { pin: i32, dir: i32 },
    Json(Vec<u8>),
}

static EMIT_SENDER: std::sync::OnceLock<std::sync::mpsc::SyncSender<WorkerEvent>> = std::sync::OnceLock::new();
static DROPPED_EVENTS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

fn emit_event(val: &serde_json::Value) {
    if let Some(tx) = EMIT_SENDER.get() {
        if let Ok(mut text) = serde_json::to_vec(val) {
            text.push(b'\n');
            if tx.try_send(WorkerEvent::Json(text)).is_err() {
                let dropped = DROPPED_EVENTS.fetch_add(1, Ordering::Relaxed) + 1;
                if dropped % 1000 == 1 {
                    eprintln!("[mcu-maker-worker] WARNING: stdout backpressure, {} events dropped", dropped);
                }
            }
        }
    }
}

fn emit_uart_tx(uart: u8, byte: u8) {
    if let Some(tx) = EMIT_SENDER.get() {
        if tx.try_send(WorkerEvent::UartTx { uart, byte }).is_err() {
            let dropped = DROPPED_EVENTS.fetch_add(1, Ordering::Relaxed) + 1;
            if dropped % 1000 == 1 {
                eprintln!("[mcu-maker-worker] WARNING: stdout backpressure, {} events dropped", dropped);
            }
        }
    }
}

fn emit_gpio_change(pin: i32, state: i32) {
    if let Some(tx) = EMIT_SENDER.get() {
        if tx.try_send(WorkerEvent::GpioChange { pin, state }).is_err() {
            let dropped = DROPPED_EVENTS.fetch_add(1, Ordering::Relaxed) + 1;
            if dropped % 1000 == 1 {
                eprintln!("[mcu-maker-worker] WARNING: stdout backpressure, {} events dropped", dropped);
            }
        }
    }
}

fn emit_gpio_dir(pin: i32, dir: i32) {
    if let Some(tx) = EMIT_SENDER.get() {
        if tx.try_send(WorkerEvent::GpioDir { pin, dir }).is_err() {
            let dropped = DROPPED_EVENTS.fetch_add(1, Ordering::Relaxed) + 1;
            if dropped % 1000 == 1 {
                eprintln!("[mcu-maker-worker] WARNING: stdout backpressure, {} events dropped", dropped);
            }
        }
    }
}

fn format_worker_event(buf: &mut Vec<u8>, ev: WorkerEvent) {
    use std::io::Write;
    match ev {
        WorkerEvent::UartTx { uart, byte } => {
            let _ = write!(buf, "{{\"type\":\"uart_tx\",\"uart\":{},\"byte\":{}}}\n", uart, byte);
        }
        WorkerEvent::GpioChange { pin, state } => {
            let _ = write!(buf, "{{\"type\":\"gpio_change\",\"pin\":{},\"state\":{}}}\n", pin, state & 1);
        }
        WorkerEvent::GpioDir { pin, dir } => {
            let _ = write!(buf, "{{\"type\":\"gpio_dir\",\"pin\":{},\"dir\":{}}}\n", pin, dir);
        }
        WorkerEvent::Json(bytes) => {
            buf.extend_from_slice(&bytes);
        }
    }
}

fn start_emit_writer(mut out: Box<dyn std::io::Write + Send>) -> std::sync::mpsc::SyncSender<WorkerEvent> {
    let (tx, rx) = std::sync::mpsc::sync_channel::<WorkerEvent>(50000);
    std::thread::Builder::new()
        .name("emit-writer".to_string())
        .spawn(move || {
            let mut write_buf = Vec::with_capacity(65536);

            while let Ok(first_event) = rx.recv() {
                format_worker_event(&mut write_buf, first_event);

                // Opportunistically batch any pending events from the channel
                while let Ok(next_event) = rx.try_recv() {
                    format_worker_event(&mut write_buf, next_event);
                    if write_buf.len() >= 65536 {
                        break;
                    }
                }

                // Flush the batched buffer to stdout
                if out.write_all(&write_buf).is_err() {
                    // Handle closed or broken pipe
                    return;
                }
                write_buf.clear();
            }
        })
        .expect("Failed to spawn emit-writer thread");
    tx
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct WorkerConfig {
    lib_path: String,
    firmware_b64: String,
    #[serde(default = "default_machine")]
    machine: String,
    #[serde(default)]
    sensors: Vec<serde_json::Value>,
    #[serde(default)]
    wifi_enabled: bool,
    #[serde(default)]
    wifi_hostfwd_port: u16,
    #[serde(default)]
    bus_map: serde_json::Value,
}

fn default_machine() -> String {
    "esp32-picsimlab".to_string()
}

fn pad_to_flash_size(mut fw: Vec<u8>) -> Vec<u8> {
    let valid_sizes = [2 * 1024 * 1024, 4 * 1024 * 1024, 8 * 1024 * 1024, 16 * 1024 * 1024];
    let min_flash = 4 * 1024 * 1024;
    let target = valid_sizes
        .into_iter()
        .find(|&s| s >= fw.len().max(min_flash))
        .unwrap_or(16 * 1024 * 1024);
    if fw.len() < target {
        fw.resize(target, 0xFF);
    }
    fw
}

#[repr(C)]
pub struct PicsimlabCallbacks {
    pub picsimlab_write_pin: Option<unsafe extern "C" fn(i32, i32)>,
    pub picsimlab_dir_pin: Option<unsafe extern "C" fn(i32, i32)>,
    pub picsimlab_i2c_event: Option<unsafe extern "C" fn(u8, u8, u16) -> i32>,
    pub picsimlab_spi_event: Option<unsafe extern "C" fn(u8, u16) -> u8>,
    pub picsimlab_uart_tx_event: Option<unsafe extern "C" fn(u8, u8)>,
    pub pinmap: *const i16,
    pub picsimlab_rmt_event: Option<unsafe extern "C" fn(u8, u32, u32)>,
    pub picsimlab_gpio_matrix_cb: Option<unsafe extern "C" fn(i32, i32)>,
    pub picsimlab_spi_event_batch: Option<unsafe extern "C" fn(u8, *const u8, i32)>,
}

static PINMAP: [i16; 41] = [
    40, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
];

static PINMAP_C3: [i16; 23] = [
    22, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    20, 21,
];

unsafe extern "C" fn on_write_pin(slot: i32, value: i32) {
    if !(1..=40).contains(&slot) {
        return;
    }
    emit_gpio_change(slot - 1, value);
}

unsafe extern "C" fn on_dir_pin(slot: i32, dir: i32) {
    if !(1..=40).contains(&slot) {
        return;
    }
    emit_gpio_dir(slot - 1, dir);
}

unsafe extern "C" fn on_uart_tx(uart_id: u8, byte_val: u8) {
    emit_uart_tx(uart_id, byte_val);
}

unsafe extern "C" fn on_i2c_event(_bus_id: u8, _addr: u8, _data: u16) -> i32 {
    -1 // NACK
}

unsafe extern "C" fn on_spi_event(_bus_id: u8, _mosi: u16) -> u8 {
    0xFF // MISO idle high
}

unsafe extern "C" fn on_rmt_event(channel: u8, _config0: u32, value: u32) {
    let level0 = (value >> 15) & 1;
    let dur0 = value & 0x7FFF;
    let level1 = (value >> 31) & 1;
    let dur1 = (value >> 16) & 0x7FFF;

    emit_event(&serde_json::json!({
        "type": "rmt_event",
        "channel": channel,
        "value": value,
        "level0": level0,
        "dur0": dur0,
        "level1": level1,
        "dur1": dur1
    }));
}

pub struct QemuBindings {
    _lib: Arc<libloading::Library>,
    pub set_pin: unsafe extern "C" fn(i32, i32),
    pub uart_receive: unsafe extern "C" fn(i32, *const u8, i32),
    pub set_apin: Option<unsafe extern "C" fn(i32, i32)>,
    pub shutdown_request: Option<unsafe extern "C" fn(i32)>,
    pub bql_lock: Option<unsafe extern "C" fn(*const i8, i32)>,
    pub bql_unlock: Option<unsafe extern "C" fn()>,
    pub bql_locked: Option<unsafe extern "C" fn() -> bool>,
}

impl QemuBindings {
    pub fn with_bql<F, R>(&self, f: F) -> R
    where
        F: FnOnce() -> R,
    {
        let should_lock = match self.bql_locked {
            Some(locked_fn) => unsafe { !locked_fn() },
            None => true,
        };
        if should_lock {
            if let Some(lock_fn) = self.bql_lock {
                unsafe {
                    lock_fn(b"mcu-maker-worker\0".as_ptr() as *const i8, 0);
                }
            }
        }
        let res = f();
        if should_lock {
            if let Some(unlock_fn) = self.bql_unlock {
                unsafe {
                    unlock_fn();
                }
            }
        }
        res
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Read initial configuration from stdin before stdio redirection
    let mut initial_line = String::new();
    if std::io::stdin().read_line(&mut initial_line)? == 0 {
        eprintln!("[mcu-maker-worker] No config received on stdin. Exiting.");
        std::process::exit(1);
    }

    let cfg: WorkerConfig = match serde_json::from_str(initial_line.trim()) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[mcu-maker-worker] Bad config JSON: {e}");
            std::process::exit(1);
        }
    };

    // 2. Preserve original stdin and stdout (platform layer), then redirect fd 0/1
    //    to the null device so QEMU cannot corrupt our JSON pipe.
    let (stdin_reader, stdout_writer) = sys::take_stdio();

    // Initialize non-blocking asynchronous writer thread
    let emit_sender = start_emit_writer(stdout_writer);
    let _ = EMIT_SENDER.set(emit_sender);

    // 3. Decode & pad firmware
    let fw_raw = base64::engine::general_purpose::STANDARD.decode(&cfg.firmware_b64)
        .map_err(|e| format!("Base64 firmware decode error: {e}"))?;
    let fw_padded = pad_to_flash_size(fw_raw);

    let temp_dir = std::env::temp_dir();
    let temp_fw_path = temp_dir.join(format!("mcu_maker_fw_{}.bin", std::process::id()));
    std::fs::write(&temp_fw_path, &fw_padded)
        .map_err(|e| format!("Failed to create temporary firmware file {:?}: {e}", temp_fw_path))?;
    let fw_path = temp_fw_path.to_string_lossy().to_string();

    // 4. Configure library search path & load QEMU library
    let lib_path = PathBuf::from(&cfg.lib_path);
    if let Some(parent) = lib_path.parent() {
        sys::set_dll_directory(parent);
    }

    let lib = Arc::new(unsafe {
        libloading::Library::new(&lib_path)
            .map_err(|e| format!("Cannot load QEMU library at {:?}: {e}", lib_path))?
    });

    let qemu_init: libloading::Symbol<unsafe extern "C" fn(i32, *const *const i8, *const *const i8) -> i32> =
        unsafe { lib.get(b"qemu_init\0")? };
    let qemu_main_loop: libloading::Symbol<unsafe extern "C" fn()> =
        unsafe { lib.get(b"qemu_main_loop\0")? };
    let qemu_picsimlab_register_callbacks: libloading::Symbol<unsafe extern "C" fn(*const PicsimlabCallbacks)> =
        unsafe { lib.get(b"qemu_picsimlab_register_callbacks\0")? };
    let qemu_picsimlab_set_pin: libloading::Symbol<unsafe extern "C" fn(i32, i32)> =
        unsafe { lib.get(b"qemu_picsimlab_set_pin\0")? };
    let qemu_picsimlab_uart_receive: libloading::Symbol<unsafe extern "C" fn(i32, *const u8, i32)> =
        unsafe { lib.get(b"qemu_picsimlab_uart_receive\0")? };
    let qemu_picsimlab_set_apin: Option<libloading::Symbol<unsafe extern "C" fn(i32, i32)>> =
        unsafe { lib.get(b"qemu_picsimlab_set_apin\0").ok() };
    let qemu_system_shutdown_request: Option<libloading::Symbol<unsafe extern "C" fn(i32)>> =
        unsafe { lib.get(b"qemu_system_shutdown_request\0").ok() };

    let bql_lock: Option<libloading::Symbol<unsafe extern "C" fn(*const i8, i32)>> =
        unsafe { lib.get(b"bql_lock_impl\0").or_else(|_| lib.get(b"qemu_mutex_lock_iothread_impl\0")).ok() };
    let bql_unlock: Option<libloading::Symbol<unsafe extern "C" fn()>> =
        unsafe { lib.get(b"bql_unlock\0").or_else(|_| lib.get(b"qemu_mutex_unlock_iothread\0")).ok() };
    let bql_locked: Option<libloading::Symbol<unsafe extern "C" fn() -> bool>> =
        unsafe { lib.get(b"bql_locked\0").or_else(|_| lib.get(b"qemu_mutex_iothread_locked\0")).ok() };

    // Register Callbacks permanently in static memory
    let callbacks = Box::leak(Box::new(PicsimlabCallbacks {
        picsimlab_write_pin: Some(on_write_pin),
        picsimlab_dir_pin: Some(on_dir_pin),
        picsimlab_i2c_event: Some(on_i2c_event),
        picsimlab_spi_event: Some(on_spi_event),
        picsimlab_uart_tx_event: Some(on_uart_tx),
        pinmap: if cfg.machine == "esp32c3-picsimlab" {
            PINMAP_C3.as_ptr()
        } else {
            PINMAP.as_ptr()
        },
        picsimlab_rmt_event: Some(on_rmt_event),
        picsimlab_gpio_matrix_cb: None,
        picsimlab_spi_event_batch: None,
    }));
    unsafe {
        qemu_picsimlab_register_callbacks(callbacks);
    }

    // 5. Build QEMU arguments
    let rom_dir = lib_path
        .parent()
        .unwrap_or(Path::new("."))
        .to_string_lossy()
        .replace('\\', "/");
    let fw_path_norm = fw_path.replace('\\', "/");
    let mtd_drive = format!("file={},if=mtd,format=raw", fw_path_norm);

    let mut args: Vec<String> = vec![
        "qemu".to_string(),
        "-M".to_string(),
        cfg.machine.clone(),
        "-nographic".to_string(),
        "-L".to_string(),
        rom_dir,
        "-drive".to_string(),
        mtd_drive,
    ];

    if cfg.machine == "esp32-picsimlab" {
        let nic_arg = if cfg.wifi_enabled && cfg.wifi_hostfwd_port > 0 {
            format!(
                "user,model=esp32_wifi,net=192.168.4.0/24,hostfwd=tcp::{}-192.168.4.15:80",
                cfg.wifi_hostfwd_port
            )
        } else {
            "user,model=esp32_wifi,net=192.168.4.0/24".to_string()
        };
        args.push("-nic".to_string());
        args.push(nic_arg);
    }

    let c_strings: Vec<CString> = args
        .iter()
        .map(|s| CString::new(s.as_bytes()).unwrap())
        .collect();
    let argc = c_strings.len() as i32;

    // 6. Spawn QEMU main loop thread
    let (init_tx, init_rx) = std::sync::mpsc::channel();
    let init_fn = *qemu_init;
    let main_loop_fn = *qemu_main_loop;
    std::thread::Builder::new()
        .name("qemu-core".to_string())
        .spawn(move || unsafe {
            let mut c_ptrs: Vec<*const i8> = c_strings.iter().map(|cs| cs.as_ptr()).collect();
            c_ptrs.push(std::ptr::null());
            init_fn(argc, c_ptrs.as_ptr(), std::ptr::null());
            let _ = init_tx.send(());
            main_loop_fn();
        })?;

    // Wait until QEMU has fully initialized before announcing booted or accepting stdin commands
    if let Err(e) = init_rx.recv() {
        eprintln!("[mcu-maker-worker] qemu-core thread terminated before initialization completed: {:?}", e);
        std::process::exit(1);
    }

    // Announce simulator booted
    emit_event(&serde_json::json!({
        "type": "system",
        "event": "booted"
    }));

    // Create thread-safe bindings for the command loop
    let bindings = Arc::new(QemuBindings {
        _lib: lib.clone(),
        set_pin: *qemu_picsimlab_set_pin,
        uart_receive: *qemu_picsimlab_uart_receive,
        set_apin: qemu_picsimlab_set_apin.map(|s| *s),
        shutdown_request: qemu_system_shutdown_request.map(|s| *s),
        bql_lock: bql_lock.map(|s| *s),
        bql_unlock: bql_unlock.map(|s| *s),
        bql_locked: bql_locked.map(|s| *s),
    });

    // 7. Command loop reading from original stdin
    let reader = BufReader::new(stdin_reader);

    for line in reader.lines().flatten() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Ok(cmd) = serde_json::from_str::<serde_json::Value>(trimmed) {
            let action = cmd.get("cmd").and_then(|c| c.as_str()).unwrap_or("");
            match action {
                "set_pin" => {
                    if let (Some(pin), Some(val)) = (
                        cmd.get("pin").and_then(|p| p.as_i64()),
                        cmd.get("value").and_then(|v| v.as_i64()),
                    ) {
                        unsafe {
                            (bindings.set_pin)(pin as i32 + 1, val as i32);
                        }
                    }
                }
                "uart_send" => {
                    if let Some(b64_data) = cmd.get("data").and_then(|d| d.as_str()) {
                        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64_data) {
                            let uart = cmd.get("uart").and_then(|u| u.as_i64()).unwrap_or(0) as i32;
                            let bindings_clone = bindings.clone();
                            bindings_clone.with_bql(|| unsafe {
                                (bindings_clone.uart_receive)(uart, bytes.as_ptr(), bytes.len() as i32);
                            });
                        }
                    }
                }
                "set_adc" => {
                    if let (Some(mv), Some(ch)) = (
                        cmd.get("millivolts").and_then(|m| m.as_i64()),
                        cmd.get("channel").and_then(|c| c.as_i64()),
                    ) {
                        let raw_v = (mv * 4095 / 3300).clamp(0, 4095) as i32;
                        if let Some(set_apin) = bindings.set_apin {
                            unsafe {
                                set_apin(ch as i32, raw_v);
                            }
                        }
                    }
                }
                "set_adc_raw" => {
                    if let (Some(raw), Some(ch)) = (
                        cmd.get("raw").and_then(|r| r.as_i64()),
                        cmd.get("channel").and_then(|c| c.as_i64()),
                    ) {
                        if let Some(set_apin) = bindings.set_apin {
                            unsafe {
                                set_apin(ch as i32, raw.clamp(0, 4095) as i32);
                            }
                        }
                    }
                }
                "stop" => {
                    let _ = std::fs::remove_file(&temp_fw_path);
                    if let Some(shutdown) = bindings.shutdown_request {
                        unsafe {
                            shutdown(3);
                        }
                    }
                    std::process::exit(0);
                }
                _ => {}
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_worker_config_deserialization() {
        let json_str = r#"{
            "firmware_b64": "AAAA",
            "lib_path": "/path/to/lib",
            "machine": "esp32-picsimlab",
            "wifi_enabled": false,
            "wifi_hostfwd_port": 0,
            "sensors": [],
            "bus_map": null
        }"#;
        let cfg: Result<WorkerConfig, _> = serde_json::from_str(json_str);
        assert!(cfg.is_ok());
        let c = cfg.unwrap();
        assert_eq!(c.machine, "esp32-picsimlab");
        assert_eq!(c.firmware_b64, "AAAA");
    }

    #[test]
    fn test_pinmaps() {
        assert!(PINMAP.len() >= 40);
        assert!(PINMAP_C3.len() >= 22);
    }

    #[test]
    fn test_qemu_libraries_exist_and_loadable() {
        let xtensa_name = if cfg!(windows) { "libqemu-xtensa.dll" } else { "libqemu-xtensa.so" };
        let riscv_name = if cfg!(windows) { "libqemu-riscv32.dll" } else { "libqemu-riscv32.so" };

        let candidate_dirs = [
            PathBuf::from("/opt/mcu-maker/prebuilt/qemu_runtime"),
            PathBuf::from("../../prebuilt/qemu_runtime"),
            PathBuf::from("../../prebuilt/qemu_runtime_linux"),
            PathBuf::from("prebuilt/qemu_runtime"),
        ];

        let find_lib = |name: &str| -> Option<PathBuf> {
            for dir in &candidate_dirs {
                let p = dir.join(name);
                if p.is_file() {
                    return Some(p);
                }
            }
            None
        };

        if let Some(xtensa_path) = find_lib(xtensa_name) {
            unsafe {
                let lib = libloading::Library::new(&xtensa_path);
                assert!(lib.is_ok(), "Failed to load xtensa library at {:?}", xtensa_path);
                let lib = lib.unwrap();
                let qemu_init: Result<libloading::Symbol<unsafe extern "C" fn(i32, *const *const i8, *const *const i8) -> i32>, _> = lib.get(b"qemu_init\0");
                assert!(qemu_init.is_ok(), "qemu_init symbol not found in xtensa lib");
                std::mem::forget(lib);
            }
        }

        if let Some(riscv_path) = find_lib(riscv_name) {
            unsafe {
                let lib = libloading::Library::new(&riscv_path);
                assert!(lib.is_ok(), "Failed to load riscv library at {:?}", riscv_path);
                let lib = lib.unwrap();
                let qemu_init: Result<libloading::Symbol<unsafe extern "C" fn(i32, *const *const i8, *const *const i8) -> i32>, _> = lib.get(b"qemu_init\0");
                assert!(qemu_init.is_ok(), "qemu_init symbol not found in riscv lib");
                std::mem::forget(lib);
            }
        }
    }
}
