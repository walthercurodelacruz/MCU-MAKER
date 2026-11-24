use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::{mpsc, Mutex};
use tracing::info;

#[derive(Debug, Clone)]
pub struct CompileProgressEvent {
    pub line: Option<String>,
    pub stage: Option<String>,
    pub progress: Option<f32>,
}

pub type ProgressTx = mpsc::UnboundedSender<CompileProgressEvent>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SketchFile {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompileResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hex_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub binary_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub binary_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uf2_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_wifi: Option<bool>,
    pub stdout: String,
    pub stderr: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_kind: Option<String>,
}

static CORE_INSTALL_LOCK: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();
static BUILD_PATH_LOCK: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();

fn global_core_install_lock() -> &'static Mutex<()> {
    CORE_INSTALL_LOCK.get_or_init(|| Mutex::new(()))
}

fn global_build_path_lock() -> &'static Mutex<()> {
    BUILD_PATH_LOCK.get_or_init(|| Mutex::new(()))
}

/// Resolves the bundled pure-Python libraries directory (`prebuilt/python_libs`, containing `pyserial`)
/// so `esptool.py` works out-of-the-box on any Linux host without requiring system `python3-pyserial`.
pub fn find_python_libs_dir() -> Option<PathBuf> {
    let mut check_dirs = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        check_dirs.push(cwd);
    }
    if let Ok(cur_exe) = std::env::current_exe() {
        if let Some(p) = cur_exe.parent() {
            check_dirs.push(p.to_path_buf());
        }
    }
    for dir in &check_dirs {
        let mut curr = Some(dir.as_path());
        while let Some(p) = curr {
            let candidate = p.join("prebuilt").join("python_libs");
            if candidate.join("serial").is_dir() {
                return Some(candidate);
            }
            curr = p.parent();
        }
    }
    #[cfg(not(windows))]
    {
        let opt = PathBuf::from("/opt/mcu-maker/prebuilt/python_libs");
        if opt.join("serial").is_dir() {
            return Some(opt);
        }
    }
    None
}

fn configure_python_env(cmd: &mut Command) {
    if let Some(py_libs) = find_python_libs_dir() {
        let new_pythonpath = match std::env::var_os("PYTHONPATH") {
            Some(existing) if !existing.is_empty() => {
                let mut paths = vec![py_libs];
                paths.extend(std::env::split_paths(&existing));
                std::env::join_paths(paths).ok()
            }
            _ => Some(py_libs.into_os_string()),
        };
        if let Some(val) = new_pythonpath {
            cmd.env("PYTHONPATH", val);
        }
    }
}

/// Persistent build-path directory per board FQBN and sketch stem so `arduino-cli`
/// reuses compiled core (`core.a`) and library object files across compilations (~2.4s vs ~60s).
fn persistent_build_path(effective_fqbn: &str, sketch_stem: &str) -> Option<PathBuf> {
    let sanitized_fqbn: String = effective_fqbn
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let sanitized_stem: String = sketch_stem
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let dir_name = format!("{sanitized_fqbn}__{sanitized_stem}");
    let mut bases = Vec::new();
    if let Ok(cache_env) = std::env::var("MCU_MAKER_ARTIFACT_CACHE") {
        bases.push(PathBuf::from(cache_env).join("build-cache"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        bases.push(cwd.join("artifacts").join("build-cache"));
    }
    bases.push(std::env::temp_dir().join("mcu-maker-build-cache"));

    for base in bases {
        let dir = base.join(&dir_name);
        if std::fs::create_dir_all(&dir).is_ok() {
            return Some(dir);
        }
    }
    None
}

#[derive(Clone)]
pub struct ArduinoCLIService {
    pub binary_path: PathBuf,
}

pub const ADDITIONAL_URLS: &str = "https://espressif.github.io/arduino-esp32/package_esp32_index.json,https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json,http://drazzy.com/package_drazzy.com_index.json";

/// Per-user Arduino data directory: `%LOCALAPPDATA%\Arduino15` on Windows,
/// `~/.arduino15` on Linux.
fn arduino_data_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Arduino15"))
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".arduino15"))
    }
}

pub fn ensure_arduino_config_in(dir: &std::path::Path) {
    let config_file = dir.join("arduino-cli.yaml");
    let default_yaml = r#"board_manager:
  additional_urls:
    - https://espressif.github.io/arduino-esp32/package_esp32_index.json
    - https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json
    - http://drazzy.com/package_drazzy.com_index.json
"#;
    if !config_file.exists() {
        let _ = std::fs::create_dir_all(dir);
        let _ = std::fs::write(&config_file, default_yaml);
    } else if let Ok(existing) = std::fs::read_to_string(&config_file) {
        if !existing.contains("espressif.github.io")
            || !existing.contains("earlephilhower")
            || !existing.contains("drazzy.com")
        {
            let _ = std::fs::write(&config_file, default_yaml);
        }
    }
}

pub fn ensure_arduino_config() {
    if let Some(dir) = arduino_data_dir() {
        ensure_arduino_config_in(&dir);
    }
}

pub fn sanitize_relative_sketch_path(name: &str) -> Result<PathBuf, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return Err("Invalid empty or null-byte sketch filename".to_string());
    }
    if trimmed.contains('\\') {
        return Err(format!("Backslashes are not permitted in sketch path: {trimmed}"));
    }
    let rel = std::path::Path::new(trimmed);
    if rel.is_absolute() {
        return Err(format!("Absolute paths are not permitted in sketch: {trimmed}"));
    }
    let mut clean = PathBuf::new();
    for comp in rel.components() {
        match comp {
            std::path::Component::Normal(seg) => clean.push(seg),
            _ => {
                return Err(format!("Unsafe path component in sketch filename: {trimmed}"));
            }
        }
    }
    if clean.as_os_str().is_empty() {
        return Err(format!("Invalid sketch filename: {trimmed}"));
    }
    Ok(clean)
}

impl ArduinoCLIService {
    pub fn new(configured_path: Option<String>) -> Self {
        ensure_arduino_config();
        let binary_path = if let Some(path) = configured_path {
            PathBuf::from(path)
        } else if let Ok(path) = std::env::var("ARDUINO_CLI_BIN") {
            PathBuf::from(path)
        } else {
            Self::find_arduino_cli()
        };

        info!("Arduino CLI binary resolved to: {:?}", binary_path);
        Self {
            binary_path,
        }
    }

    pub fn find_arduino_cli() -> PathBuf {
        let exe_name = format!("arduino-cli{}", std::env::consts::EXE_SUFFIX);

        // 0. Search ancestors of current_dir and current_exe for prebuilt/arduino-cli
        let mut check_dirs = Vec::new();
        if let Ok(cwd) = std::env::current_dir() {
            check_dirs.push(cwd);
        }
        if let Ok(cur_exe) = std::env::current_exe() {
            if let Some(p) = cur_exe.parent() {
                check_dirs.push(p.to_path_buf());
            }
        }

        for dir in &check_dirs {
            let mut curr = Some(dir.as_path());
            while let Some(p) = curr {
                for sub in &["arduino-cli", "arduino-cli-linux", "arduino-cli-windows"] {
                    let candidate = p.join("prebuilt").join(sub).join(&exe_name);
                    if candidate.is_file() {
                        return candidate;
                    }
                }
                let cand_direct = p.join(&exe_name);
                if cand_direct.is_file() {
                    return cand_direct;
                }
                curr = p.parent();
            }
        }

        // 1. Check PATH
        #[cfg(windows)]
        let path_finder = "where.exe";
        #[cfg(not(windows))]
        let path_finder = "which";
        if let Ok(output) = std::process::Command::new(path_finder)
            .arg("arduino-cli")
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(line) = stdout.lines().next() {
                    let path = PathBuf::from(line.trim());
                    if path.is_file() {
                        return path;
                    }
                }
            }
        }

        // 2. Check conventional installation locations
        #[cfg(windows)]
        let candidates: Vec<PathBuf> = vec![
            PathBuf::from(r"C:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"),
            PathBuf::from(r"C:\Program Files (x86)\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"),
            PathBuf::from(r"C:\arduino-cli\arduino-cli.exe"),
        ];
        #[cfg(not(windows))]
        let candidates: Vec<PathBuf> = {
            let mut v = vec![
                PathBuf::from("/opt/mcu-maker/prebuilt/arduino-cli/arduino-cli"),
                PathBuf::from("/opt/mcu-maker/arduino-cli"),
                PathBuf::from("/usr/local/bin/arduino-cli"),
                PathBuf::from("/usr/bin/arduino-cli"),
                PathBuf::from("/opt/arduino-cli/arduino-cli"),
                PathBuf::from("/snap/bin/arduino-cli"),
            ];
            if let Some(home) = std::env::var_os("HOME") {
                let home = PathBuf::from(home);
                v.push(home.join("bin").join("arduino-cli"));
                v.push(home.join(".local").join("bin").join("arduino-cli"));
            }
            v
        };

        for p in candidates {
            if p.is_file() {
                return p;
            }
        }

        PathBuf::from("arduino-cli")
    }

    pub async fn check_available(&self) -> bool {
        Command::new(&self.binary_path)
            .arg("version")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    pub async fn compile(
        &self,
        files: &[SketchFile],
        board_fqbn: &str,
    ) -> Result<CompileResult, String> {
        self.compile_with_progress(files, board_fqbn, None).await
    }

    fn extract_percent(line: &str) -> Option<f32> {
        // Parse percentage token like "78.80%" from arduino-cli download lines
        for token in line.split_whitespace() {
            if let Some(num_str) = token.strip_suffix('%') {
                if let Ok(pct) = num_str.parse::<f32>() {
                    if (0.0..=100.0).contains(&pct) {
                        return Some(pct / 100.0);
                    }
                }
            }
        }
        None
    }

    fn infer_stage_progress(line: &str, default_stage: &str) -> (String, Option<f32>) {
        let low = line.to_lowercase();
        if let Some(frac) = Self::extract_percent(line) {
            if default_stage == "preparing" || low.contains("mib") || low.contains("kib") {
                return ("preparing".to_string(), Some((0.10 + frac * 0.45).clamp(0.10, 0.55)));
            }
        }
        if low.contains("configuring tool") || low.contains("configurando") || low.contains("instalando") || low.contains("installing") {
            ("preparing".to_string(), Some(0.58))
        } else if low.contains("descargando") || low.contains("downloading") {
            ("preparing".to_string(), Some(0.12))
        } else if low.contains("linking") || low.contains("esptool") || low.contains("merged.bin") || low.contains("objcopy") {
            ("linking".to_string(), Some(0.88))
        } else if low.contains("compiling core") || low.contains("compiling libraries") {
            ("compiling".to_string(), Some(0.72))
        } else if low.contains("compiling sketch") {
            ("compiling".to_string(), Some(0.62))
        } else if low.contains("detecting libraries") || low.contains("resolving") {
            ("preparing".to_string(), Some(0.25))
        } else if low.contains("sketch uses") || low.contains("el sketch usa") {
            ("packaging".to_string(), Some(0.96))
        } else {
            (default_stage.to_string(), None)
        }
    }

    async fn read_stream_chunks<R: tokio::io::AsyncRead + Unpin>(
        mut reader: R,
        progress_tx: Option<ProgressTx>,
        default_stage: String,
    ) -> String {
        let mut full = Vec::new();
        let mut line_buf = Vec::new();
        let mut buf = [0u8; 4096];
        let mut last_cr_emit = std::time::Instant::now()
            .checked_sub(Duration::from_secs(5))
            .unwrap_or_else(std::time::Instant::now);

        loop {
            match reader.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    full.extend_from_slice(&buf[..n]);
                    for &b in &buf[..n] {
                        if b == b'\n' || b == b'\r' {
                            if !line_buf.is_empty() {
                                let text = String::from_utf8_lossy(&line_buf).trim().to_string();
                                line_buf.clear();
                                if !text.is_empty() {
                                    // Throttle carriage-return (\r) download progress updates so we don't flood stdout buffer
                                    let is_cr_progress = b == b'\r' || (text.contains('%') && (text.contains("MiB") || text.contains("KiB")));
                                    if is_cr_progress && last_cr_emit.elapsed() < Duration::from_millis(750) && !text.contains("100.00%") {
                                        continue;
                                    }
                                    if is_cr_progress {
                                        last_cr_emit = std::time::Instant::now();
                                    }
                                    if let Some(ref tx) = progress_tx {
                                        let (stage, prog) = Self::infer_stage_progress(&text, &default_stage);
                                        let _ = tx.send(CompileProgressEvent {
                                            line: Some(text),
                                            stage: Some(stage),
                                            progress: prog,
                                        });
                                    }
                                }
                            }
                        } else {
                            line_buf.push(b);
                        }
                    }
                }
            }
        }
        if !line_buf.is_empty() {
            let text = String::from_utf8_lossy(&line_buf).trim().to_string();
            if !text.is_empty() {
                if let Some(ref tx) = progress_tx {
                    let (stage, prog) = Self::infer_stage_progress(&text, &default_stage);
                    let _ = tx.send(CompileProgressEvent {
                        line: Some(text),
                        stage: Some(stage),
                        progress: prog,
                    });
                }
            }
        }
        String::from_utf8_lossy(&full).to_string()
    }

    async fn run_command_streaming(
        cmd: &mut Command,
        timeout_dur: Duration,
        progress_tx: Option<&ProgressTx>,
        default_stage: &str,
        label: &str,
    ) -> Result<(bool, String, String), String> {
        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        configure_python_env(cmd);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to execute arduino-cli ({label}): {e}"))?;

        let stdout_pipe = child.stdout.take();
        let stderr_pipe = child.stderr.take();
        let tx_out = progress_tx.cloned();
        let tx_err = progress_tx.cloned();
        let st_out = default_stage.to_string();
        let st_err = default_stage.to_string();

        let out_task = tokio::spawn(async move {
            match stdout_pipe {
                Some(p) => Self::read_stream_chunks(p, tx_out, st_out).await,
                None => String::new(),
            }
        });
        let err_task = tokio::spawn(async move {
            match stderr_pipe {
                Some(p) => Self::read_stream_chunks(p, tx_err, st_err).await,
                None => String::new(),
            }
        });

        let wait_res = tokio::time::timeout(timeout_dur, child.wait()).await;
        match wait_res {
            Ok(Ok(status)) => {
                let stdout = out_task.await.unwrap_or_default();
                let stderr = err_task.await.unwrap_or_default();
                Ok((status.success(), stdout, stderr))
            }
            Ok(Err(e)) => {
                let _ = child.kill().await;
                Err(format!("arduino-cli ({label}) wait failed: {e}"))
            }
            Err(_) => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                Err(format!(
                    "Timeout ({}s) ejecutando arduino-cli ({label}). Verifica tu conexión a internet o cancela procesos colgados.",
                    timeout_dur.as_secs()
                ))
            }
        }
    }

    pub async fn compile_with_progress(
        &self,
        files: &[SketchFile],
        board_fqbn: &str,
        progress_tx: Option<ProgressTx>,
    ) -> Result<CompileResult, String> {
        // Determine primary ino name and stem for directory naming.
        // Arduino CLI requires that the directory name matches the primary .ino file.
        let mut main_ino_name = "sketch.ino".to_string();
        for f in files {
            if f.name.ends_with(".ino") {
                main_ino_name = sanitize_relative_sketch_path(&f.name)?
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("sketch.ino")
                    .to_string();
                break;
            }
        }
        let sketch_stem = std::path::Path::new(&main_ino_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("sketch")
            .to_string();

        let temp_dir = tempfile::tempdir().map_err(|e| format!("Failed to create tempdir: {e}"))?;
        let sketch_dir = temp_dir.path().join(&sketch_stem);
        tokio::fs::create_dir_all(&sketch_dir)
            .await
            .map_err(|e| format!("Failed to create sketch dir: {e}"))?;

        let output_dir = temp_dir.path().join("build");
        tokio::fs::create_dir_all(&output_dir)
            .await
            .map_err(|e| format!("Failed to create build dir: {e}"))?;

        let is_esp32 = board_fqbn.starts_with("esp32:") || board_fqbn.contains("esp32");
        let is_esp32_s3_or_c3 = board_fqbn.contains("esp32s3") || board_fqbn.contains("esp32c3");
        let needs_builtin_led_def = is_esp32 && !is_esp32_s3_or_c3;
        let is_rp2040 = board_fqbn.starts_with("rp2040:") || board_fqbn.contains("rp2040") || board_fqbn.contains("pico");
        let is_stm32 = board_fqbn.starts_with("STMicroelectronics:") || board_fqbn.contains("stm32");

        let wifi_cfg = super::wifi_config::WiFiConfig::load();
        let re_wifi = regex::Regex::new(r#"WiFi\.begin\s*\([^)]*\)"#)
            .map_err(|e| format!("Regex error: {e}"))?;
        // Note: QEMU's virtual AP in esp32_wifi.c only supports OPEN authentication (no WPA2 handshake).
        // Omitting the channel parameter allows standard auto-channel discovery without FreeRTOS lockups.
        let target_wifi_call = format!(
            r#"WiFi.begin("{}", "")"#,
            wifi_cfg.virtual_ap_name
        );
        let re_idf_ssid = regex::Regex::new(r#"(\.ssid\s*=\s*)"[^"]*""#).ok();
        let re_idf_pass = regex::Regex::new(r#"(\.password\s*=\s*)"[^"]*""#).ok();

        let mut has_wifi_code = false;
        for f in files {
            let safe_rel = sanitize_relative_sketch_path(&f.name)?;
            let target_path = sketch_dir.join(&safe_rel);
            if let Some(parent) = target_path.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }

            let mut content = f.content.clone();

            // ESP32: normalize WiFi for QEMU simulation and ensure LED_BUILTIN fallback
            if is_esp32 && (f.name.ends_with(".ino") || f.name.ends_with(".cpp")) {
                let should_rewrite = if wifi_cfg.universal_redirect {
                    true
                } else {
                    content.contains(&wifi_cfg.ssid) || content.contains(&wifi_cfg.virtual_ap_name)
                };

                if should_rewrite {
                    content = re_wifi.replace_all(&content, target_wifi_call.as_str()).to_string();
                    // Also support ESP-IDF wifi_config_t initializers if present
                    if let Some(ref re_ssid) = re_idf_ssid {
                        let rep = format!(r#"${{1}}"{virtual_ap}""#, virtual_ap = wifi_cfg.virtual_ap_name);
                        content = re_ssid.replace_all(&content, rep.as_str()).to_string();
                    }
                    if let Some(ref re_pass) = re_idf_pass {
                        content = re_pass.replace_all(&content, r#"${1}""""#).to_string();
                    }
                }

                if needs_builtin_led_def && !content.contains("#define LED_BUILTIN") {
                    content = format!("#ifndef LED_BUILTIN\n#define LED_BUILTIN 2\n#endif\n{}", content);
                }
            }

            // RP2040: redirect Serial -> Serial1 in main sketch
            if is_rp2040 && (f.name == "sketch.ino" || f.name == main_ino_name)
                && !content.contains("#define Serial Serial1")
            {
                content = format!("#define Serial Serial1\n{}", content);
            }

            tokio::fs::write(&target_path, &content)
                .await
                .map_err(|e| format!("Failed to write {}: {e}", f.name))?;

            if content.contains("WiFi.h") || content.contains("WiFiServer") || content.contains("WiFiClient") || content.contains("WiFi.begin") {
                has_wifi_code = true;
            }
        }

        // If no .ino file was provided, write the first file as main_ino_name
        let primary_ino = sketch_dir.join(&main_ino_name);
        if !primary_ino.exists() && !files.is_empty() {
            let has_ino = files.iter().any(|f| f.name.ends_with(".ino"));
            if !has_ino {
                // For pure C / C++ / ESP-IDF sketches (e.g. main.c), create an empty placeholder .ino
                // so arduino-cli accepts the directory without duplicating symbols from main.c.
                tokio::fs::write(&primary_ino, "// Auto-generated entry point for arduino-cli\n")
                    .await
                    .map_err(|e| format!("Failed to write placeholder {}: {e}", main_ino_name))?;
            } else {
                let mut content = files[0].content.clone();
                if is_esp32 {
                    let should_rewrite = if wifi_cfg.universal_redirect {
                        true
                    } else {
                        content.contains(&wifi_cfg.ssid) || content.contains(&wifi_cfg.virtual_ap_name)
                    };
                    if should_rewrite {
                        content = re_wifi.replace_all(&content, target_wifi_call.as_str()).to_string();
                    }
                    if needs_builtin_led_def && !content.contains("#define LED_BUILTIN") {
                        content = format!("#ifndef LED_BUILTIN\n#define LED_BUILTIN 2\n#endif\n{}", content);
                    }
                }
                if is_rp2040 && !content.contains("#define Serial Serial1") {
                    content = format!("#define Serial Serial1\n{}", content);
                }
                tokio::fs::write(&primary_ino, &content)
                    .await
                    .map_err(|e| format!("Failed to write primary ino: {e}"))?;
            }
        }

        if is_esp32_s3_or_c3 {
            let shim_content = r#"
#include <stdint.h>
#include <stdbool.h>
#include "esp32-hal-gpio.h"
#include "esp32-hal-rgb-led.h"
#if __has_include("esp_arduino_version.h")
#include "esp_arduino_version.h"
#endif
#include "soc/soc_caps.h"

#if !defined(ESP_ARDUINO_VERSION) || ESP_ARDUINO_VERSION < ESP_ARDUINO_VERSION_VAL(3, 0, 0)
typedef enum {
    LED_COLOR_ORDER_RGB,
    LED_COLOR_ORDER_RBG,
    LED_COLOR_ORDER_GRB,
    LED_COLOR_ORDER_GBR,
    LED_COLOR_ORDER_BRG,
    LED_COLOR_ORDER_BGR
} rgb_led_color_order_t;
#endif

extern void __pinMode(uint8_t pin, uint8_t mode);
extern void __digitalWrite(uint8_t pin, uint8_t val);
extern int __digitalRead(uint8_t pin);

#if defined(CONFIG_IDF_TARGET_ESP32S3)
#define S3_GPIO_OUT_W1TS_REG    (*(volatile uint32_t *)0x60004008)
#define S3_GPIO_OUT_W1TC_REG    (*(volatile uint32_t *)0x6000400C)
#define S3_GPIO_ENABLE_W1TS_REG (*(volatile uint32_t *)0x60004024)
#define S3_GPIO_ENABLE_W1TC_REG (*(volatile uint32_t *)0x60004028)
#define S3_INTERNAL_LED_BIT     (1UL << 31)

void pinMode(uint8_t pin, uint8_t mode) {
    if (pin == 48 || pin == 97) {
        if (mode == 0x01 /* OUTPUT */) {
            S3_GPIO_ENABLE_W1TS_REG = S3_INTERNAL_LED_BIT;
        } else {
            S3_GPIO_ENABLE_W1TC_REG = S3_INTERNAL_LED_BIT;
        }
        return;
    }
    __pinMode(pin, mode);
}

void digitalWrite(uint8_t pin, uint8_t val) {
    if (pin == 48 || pin == 97) {
        S3_GPIO_ENABLE_W1TS_REG = S3_INTERNAL_LED_BIT;
        if (val) {
            S3_GPIO_OUT_W1TS_REG = S3_INTERNAL_LED_BIT;
        } else {
            S3_GPIO_OUT_W1TC_REG = S3_INTERNAL_LED_BIT;
        }
        return;
    }
    __digitalWrite(pin, val);
}

int digitalRead(uint8_t pin) {
    if (pin == 48 || pin == 97) {
        return (*(volatile uint32_t *)0x60004004 & S3_INTERNAL_LED_BIT) ? 1 : 0;
    }
    return __digitalRead(pin);
}

void rgbLedWriteOrdered(uint8_t pin, rgb_led_color_order_t order, uint8_t red_val, uint8_t green_val, uint8_t blue_val) {
    (void)order;
    (void)pin;
    S3_GPIO_ENABLE_W1TS_REG = S3_INTERNAL_LED_BIT;
    if (red_val > 0 || green_val > 0 || blue_val > 0) {
        S3_GPIO_OUT_W1TS_REG = S3_INTERNAL_LED_BIT;
    } else {
        S3_GPIO_OUT_W1TC_REG = S3_INTERNAL_LED_BIT;
    }
}
#elif defined(CONFIG_IDF_TARGET_ESP32C3)
#define C3_GPIO_OUT_W1TS_REG    (*(volatile uint32_t *)0x60004008)
#define C3_GPIO_OUT_W1TC_REG    (*(volatile uint32_t *)0x6000400C)
#define C3_GPIO_ENABLE_W1TS_REG (*(volatile uint32_t *)0x60004024)
#define C3_GPIO_ENABLE_W1TC_REG (*(volatile uint32_t *)0x60004028)
#define C3_LED_BIT              (1UL << 8)

void pinMode(uint8_t pin, uint8_t mode) {
    if (pin == 8 || pin == (SOC_GPIO_PIN_COUNT + 8)) {
        if (mode == 0x01 /* OUTPUT */) {
            C3_GPIO_ENABLE_W1TS_REG = C3_LED_BIT;
        } else {
            C3_GPIO_ENABLE_W1TC_REG = C3_LED_BIT;
        }
        return;
    }
    __pinMode(pin, mode);
}

void digitalWrite(uint8_t pin, uint8_t val) {
    if (pin == 8 || pin == (SOC_GPIO_PIN_COUNT + 8)) {
        C3_GPIO_ENABLE_W1TS_REG = C3_LED_BIT;
        if (val) {
            C3_GPIO_OUT_W1TS_REG = C3_LED_BIT;
        } else {
            C3_GPIO_OUT_W1TC_REG = C3_LED_BIT;
        }
        return;
    }
    __digitalWrite(pin, val);
}

int digitalRead(uint8_t pin) {
    if (pin == 8 || pin == (SOC_GPIO_PIN_COUNT + 8)) {
        return (*(volatile uint32_t *)0x60004004 & C3_LED_BIT) ? 1 : 0;
    }
    return __digitalRead(pin);
}

void rgbLedWriteOrdered(uint8_t pin, rgb_led_color_order_t order, uint8_t red_val, uint8_t green_val, uint8_t blue_val) {
    (void)order;
    (void)pin;
    C3_GPIO_ENABLE_W1TS_REG = C3_LED_BIT;
    if (red_val > 0 || green_val > 0 || blue_val > 0) {
        C3_GPIO_OUT_W1TS_REG = C3_LED_BIT;
    } else {
        C3_GPIO_OUT_W1TC_REG = C3_LED_BIT;
    }
}
#else
void rgbLedWriteOrdered(uint8_t pin, rgb_led_color_order_t order, uint8_t red_val, uint8_t green_val, uint8_t blue_val) {
    (void)order;
    uint8_t actual_pin = pin;
    if (actual_pin >= SOC_GPIO_PIN_COUNT) {
        actual_pin -= SOC_GPIO_PIN_COUNT;
    }
    __pinMode(actual_pin, OUTPUT);
    __digitalWrite(actual_pin, (red_val > 0 || green_val > 0 || blue_val > 0) ? 1 : 0);
}
#endif

void rgbLedWrite(uint8_t pin, uint8_t red_val, uint8_t green_val, uint8_t blue_val) {
    rgbLedWriteOrdered(pin, LED_COLOR_ORDER_GRB, red_val, green_val, blue_val);
}

void neopixelWrite(uint8_t pin, uint8_t red_val, uint8_t green_val, uint8_t blue_val) {
    rgbLedWriteOrdered(pin, LED_COLOR_ORDER_GRB, red_val, green_val, blue_val);
}
"#;
            let shim_path = sketch_dir.join("mcu_maker_rgb_shim.c");
            tokio::fs::write(&shim_path, shim_content)
                .await
                .map_err(|e| format!("Failed to write mcu_maker_rgb_shim.c: {e}"))?;
        }

        if is_esp32 {
            let wdt_shim = r#"
#include <Arduino.h>
#if CONFIG_IDF_TARGET_ESP32
#include "soc/timer_group_struct.h"
#include "soc/timer_group_reg.h"

extern "C" void initVariant() {
    TIMERG0.wdt_wprotect = TIMG_WDT_WKEY_VALUE;
    TIMERG0.wdt_config0.val = 0;
    TIMERG0.wdt_wprotect = 0;

    TIMERG1.wdt_wprotect = TIMG_WDT_WKEY_VALUE;
    TIMERG1.wdt_config0.val = 0;
    TIMERG1.wdt_wprotect = 0;
}
#elif CONFIG_IDF_TARGET_ESP32S3 || CONFIG_IDF_TARGET_ESP32C3
#include "soc/timer_group_struct.h"
#include "soc/timer_group_reg.h"

extern "C" void initVariant() {
    TIMERG0.wdtwprotect.val = 0x50D83AA1;
    TIMERG0.wdtconfig0.val = 0;
    TIMERG0.wdtwprotect.val = 0;

    TIMERG1.wdtwprotect.val = 0x50D83AA1;
    TIMERG1.wdtconfig0.val = 0;
    TIMERG1.wdtwprotect.val = 0;
}
#else
extern "C" void initVariant() {}
#endif
"#;
            let wdt_shim_path = sketch_dir.join("mcu_maker_wdt_shim.cpp");
            tokio::fs::write(&wdt_shim_path, wdt_shim)
                .await
                .map_err(|e| format!("Failed to write mcu_maker_wdt_shim.cpp: {e}"))?;
        }

        let mut effective_fqbn = board_fqbn.to_string();
        let no_flashmode = board_fqbn.contains("lolin32-lite");
        if is_esp32 && !no_flashmode && !effective_fqbn.contains("FlashMode") {
            effective_fqbn = format!("{}:FlashMode=dio", effective_fqbn);
        }

        let config_file = arduino_data_dir().map(|d| d.join("arduino-cli.yaml"));

        let mut cmd = Command::new(&self.binary_path);
        cmd.arg("compile")
            .arg("--fqbn")
            .arg(&effective_fqbn)
            .arg("--additional-urls")
            .arg(ADDITIONAL_URLS);

        if let Some(ref cf) = config_file {
            if cf.is_file() {
                cmd.arg("--config-file").arg(cf);
            }
        }

        if is_esp32 {
            let extra_flags = if needs_builtin_led_def {
                "build.extra_flags=-DARDUINO_ESP32_LCGAMBOA=1 -DLED_BUILTIN=2"
            } else {
                "build.extra_flags=-DARDUINO_ESP32_LCGAMBOA=1"
            };
            cmd.arg("--build-property")
                .arg(extra_flags);
            cmd.arg("--build-property")
                .arg("compiler.cpp.extra_flags=-DBitOrder=uint8_t");
            cmd.arg("--build-property")
                .arg("compiler.c.elf.extra_flags=-Wl,--allow-multiple-definition");
        }

        cmd.arg("--jobs")
            .arg("0");
        let build_path_guard = global_build_path_lock().try_lock();
        if build_path_guard.is_ok() {
            if let Some(bp) = persistent_build_path(&effective_fqbn, &sketch_stem) {
                let _ = tokio::fs::remove_dir_all(bp.join("sketch")).await;
                cmd.arg("--build-path").arg(bp);
            }
        }

        cmd.arg("--output-dir")
            .arg(&output_dir)
            .arg(&sketch_dir);

        if let Some(ref tx) = progress_tx {
            let _ = tx.send(CompileProgressEvent {
                line: Some(format!("Compilando para {}...", effective_fqbn)),
                stage: Some("compiling".to_string()),
                progress: Some(0.1),
            });
        }

        let (mut success, mut stdout, mut stderr) = Self::run_command_streaming(
            &mut cmd,
            Duration::from_secs(240),
            progress_tx.as_ref(),
            "compiling",
            "compile",
        )
        .await?;

        if !success && (stderr.contains("platform not installed") || stderr.contains("not found: platform")) {
            let core_to_install = if board_fqbn.starts_with("arduino:avr") {
                Some("arduino:avr")
            } else if board_fqbn.starts_with("ATTinyCore:avr") {
                Some("ATTinyCore:avr")
            } else if board_fqbn.starts_with("esp32:esp32") {
                Some("esp32:esp32@2.0.17")
            } else if board_fqbn.starts_with("rp2040:rp2040") {
                Some("rp2040:rp2040")
            } else {
                None
            };

            if let Some(core) = core_to_install {
                info!("Auto-installing missing Arduino core {}...", core);
                if let Some(ref tx) = progress_tx {
                    let _ = tx.send(CompileProgressEvent {
                        line: Some(format!(
                            "Instalando plataforma {} (primera compilación, descargando toolchain)...",
                            core
                        )),
                        stage: Some("preparing".to_string()),
                        progress: None,
                    });
                }

                // Serialize core index updates / installs process-wide so concurrent builds don't corrupt Arduino15
                let _install_guard = global_core_install_lock().lock().await;

                let mut update_cmd = Command::new(&self.binary_path);
                update_cmd.arg("core")
                    .arg("update-index")
                    .arg("--additional-urls")
                    .arg(ADDITIONAL_URLS);
                if let Some(ref cf) = config_file {
                    if cf.is_file() {
                        update_cmd.arg("--config-file").arg(cf);
                    }
                }
                let _ = Self::run_command_streaming(
                    &mut update_cmd,
                    Duration::from_secs(60),
                    progress_tx.as_ref(),
                    "preparing",
                    "core update-index",
                )
                .await;

                let mut install_cmd = Command::new(&self.binary_path);
                install_cmd.arg("core")
                    .arg("install")
                    .arg(core)
                    .arg("--additional-urls")
                    .arg(ADDITIONAL_URLS);
                if let Some(ref cf) = config_file {
                    if cf.is_file() {
                        install_cmd.arg("--config-file").arg(cf);
                    }
                }
                match Self::run_command_streaming(
                    &mut install_cmd,
                    Duration::from_secs(900),
                    progress_tx.as_ref(),
                    "preparing",
                    "core install",
                )
                .await
                {
                    Ok((true, _i_out, _i_err)) => {
                        info!("Core {} installed successfully. Retrying compilation...", core);
                        drop(_install_guard);
                        if let Some(ref tx) = progress_tx {
                            let _ = tx.send(CompileProgressEvent {
                                line: Some(format!("Plataforma {} instalada. Compilando sketch...", core)),
                                stage: Some("compiling".to_string()),
                                progress: Some(0.2),
                            });
                        }
                        if let Ok((r_ok, r_out, r_err)) = Self::run_command_streaming(
                            &mut cmd,
                            Duration::from_secs(240),
                            progress_tx.as_ref(),
                            "compiling",
                            "compile-retry",
                        )
                        .await
                        {
                            success = r_ok;
                            stdout = r_out;
                            stderr = r_err;
                        }
                    }
                    Ok((false, i_out, i_err)) => {
                        stderr = format!(
                            "Error al instalar la plataforma {}: {}\n{}",
                            core, i_err, i_out
                        );
                    }
                    Err(e) => {
                        stderr = format!("Error al instalar la plataforma {}: {}", core, e);
                    }
                }
            }
        }

        if !success {
            let error_kind = Self::classify_error(&stderr);
            let humanized = Self::humanize_error(&stderr);
            return Ok(CompileResult {
                success: false,
                hex_content: None,
                binary_content: None,
                binary_type: None,
                uf2_content: None,
                has_wifi: Some(has_wifi_code),
                stdout,
                stderr,
                error: Some(humanized),
                error_kind: Some(error_kind),
            });
        }

        let mut hex_content: Option<String> = None;
        let mut binary_content: Option<String> = None;
        let mut binary_type: Option<String> = None;
        let mut uf2_content: Option<String> = None;

        if is_esp32 {
            // Find {sketch_stem}.ino.bin, bootloader, partitions, merged
            let bin_file = output_dir.join(format!("{sketch_stem}.ino.bin"));
            let bootloader_file = output_dir.join(format!("{sketch_stem}.ino.bootloader.bin"));
            let partitions_file = output_dir.join(format!("{sketch_stem}.ino.partitions.bin"));
            let merged_file = output_dir.join(format!("{sketch_stem}.ino.merged.bin"));

            use base64::Engine;

            // 1. If arduino-cli/esptool generated sketch.ino.merged.bin, use it directly (preserves valid headers, boot_app0, and DIO mode).
            if merged_file.is_file() {
                if let Ok(bytes) = tokio::fs::read(&merged_file).await {
                    binary_content = Some(base64::engine::general_purpose::STANDARD.encode(&bytes));
                    binary_type = Some("bin".to_string());
                }
            } else if bin_file.is_file() {
                // 2. Fallback manual merge if merged.bin was not created
                if bootloader_file.is_file() && partitions_file.is_file() {
                    let mut boot_app0_path = None;
                    if let Some(data_dir) = arduino_data_dir() {
                        let esp_pkg = data_dir.join("packages").join("esp32");
                        if esp_pkg.is_dir() {
                            let cand = esp_pkg.join("hardware").join("esp32");
                            if cand.is_dir() {
                                if let Ok(mut entries) = tokio::fs::read_dir(&cand).await {
                                    while let Ok(Some(ent)) = entries.next_entry().await {
                                        let p = ent.path().join("tools").join("partitions").join("boot_app0.bin");
                                        if p.is_file() {
                                            boot_app0_path = Some(p);
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    let fqbn_lower = board_fqbn.to_lowercase();
                    let is_s3 = fqbn_lower.contains("esp32s3") || fqbn_lower.contains("s3");
                    let is_c3 = fqbn_lower.contains("esp32c3") || fqbn_lower.contains("c3");
                    let is_zero_offset = is_c3 || is_s3 || fqbn_lower.contains("c6") || fqbn_lower.contains("h2");
                    let bootloader_offset = if is_zero_offset { 0x0000 } else { 0x1000 };

                    let flash_size: usize = if is_s3 { 8 * 1024 * 1024 } else { 4 * 1024 * 1024 };
                    let mut flash = vec![0xFFu8; flash_size];

                    if let Ok(b_bytes) = tokio::fs::read(&bootloader_file).await {
                        let end = (bootloader_offset + b_bytes.len()).min(flash_size);
                        flash[bootloader_offset..end].copy_from_slice(&b_bytes[..end - bootloader_offset]);
                    }
                    if let Ok(p_bytes) = tokio::fs::read(&partitions_file).await {
                        let end = (0x8000 + p_bytes.len()).min(flash_size);
                        flash[0x8000..end].copy_from_slice(&p_bytes[..end - 0x8000]);
                    }
                    if let Some(ref ba_path) = boot_app0_path {
                        if let Ok(ba_bytes) = tokio::fs::read(ba_path).await {
                            let end = (0xe000 + ba_bytes.len()).min(flash_size);
                            flash[0xe000..end].copy_from_slice(&ba_bytes[..end - 0xe000]);
                        }
                    }
                    if let Ok(app_bytes) = tokio::fs::read(&bin_file).await {
                        let end = (0x10000 + app_bytes.len()).min(flash_size);
                        flash[0x10000..end].copy_from_slice(&app_bytes[..end - 0x10000]);
                    }

                    let _ = tokio::fs::write(&merged_file, &flash).await;
                    binary_content = Some(base64::engine::general_purpose::STANDARD.encode(&flash));
                    binary_type = Some("bin".to_string());
                } else if let Ok(bytes) = tokio::fs::read(&bin_file).await {
                    binary_content = Some(base64::engine::general_purpose::STANDARD.encode(&bytes));
                    binary_type = Some("bin".to_string());
                }
            }

        } else if is_rp2040 {
            use base64::Engine;
            let uf2_path = output_dir.join(format!("{sketch_stem}.ino.uf2"));
            let bin_path = output_dir.join(format!("{sketch_stem}.ino.bin"));
            if let Ok(bytes) = tokio::fs::read(&uf2_path).await {
                uf2_content = Some(base64::engine::general_purpose::STANDARD.encode(&bytes));
            }
            if let Ok(bytes) = tokio::fs::read(&bin_path).await {
                binary_content = Some(base64::engine::general_purpose::STANDARD.encode(&bytes));
                binary_type = Some("bin".to_string());
            }
        } else if is_stm32 {
            use base64::Engine;
            let elf_path = output_dir.join(format!("{sketch_stem}.ino.elf"));
            let bin_path = output_dir.join(format!("{sketch_stem}.ino.bin"));
            if let Ok(bytes) = tokio::fs::read(&elf_path).await {
                binary_content = Some(base64::engine::general_purpose::STANDARD.encode(&bytes));
                binary_type = Some("elf".to_string());
            } else if let Ok(bytes) = tokio::fs::read(&bin_path).await {
                binary_content = Some(base64::engine::general_purpose::STANDARD.encode(&bytes));
                binary_type = Some("bin".to_string());
            }
        } else {
            // Default / AVR (Intel HEX)
            let hex_path = output_dir.join(format!("{sketch_stem}.ino.hex"));
            if let Ok(content) = tokio::fs::read_to_string(&hex_path).await {
                hex_content = Some(content);
            }
        }

        // Fallback scan if still empty
        if hex_content.is_none() && binary_content.is_none() && uf2_content.is_none() {
            let mut read_dir = tokio::fs::read_dir(&output_dir)
                .await
                .map_err(|e| format!("Failed to read output dir: {e}"))?;

            while let Ok(Some(entry)) = read_dir.next_entry().await {
                let path = entry.path();
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    use base64::Engine;
                    match ext.to_lowercase().as_str() {
                        "hex" => {
                            if let Ok(content) = tokio::fs::read_to_string(&path).await {
                                hex_content = Some(content);
                            }
                        }
                        "bin" => {
                            if let Ok(bytes) = tokio::fs::read(&path).await {
                                binary_content = Some(base64::engine::general_purpose::STANDARD.encode(&bytes));
                                binary_type = Some("bin".to_string());
                            }
                        }
                        "uf2" => {
                            if let Ok(bytes) = tokio::fs::read(&path).await {
                                uf2_content = Some(base64::engine::general_purpose::STANDARD.encode(&bytes));
                            }
                        }
                        _ => {}
                    }
                }
            }
        }

        Ok(CompileResult {
            success: true,
            hex_content,
            binary_content,
            binary_type,
            uf2_content,
            has_wifi: Some(has_wifi_code),
            stdout,
            stderr,
            error: None,
            error_kind: None,
        })
    }

    fn classify_error(stderr: &str) -> String {
        let low = stderr.to_lowercase();
        if low.contains("fatal error:") && low.contains("no such file or directory") {
            "missing_library".to_string()
        } else if low.contains("undefined reference") || low.contains("ld returned 1 exit status") {
            "linker_error".to_string()
        } else if low.contains("error:") || low.contains("syntax error") {
            "compile_error".to_string()
        } else if low.contains("platform not installed") {
            "core_install_failed".to_string()
        } else {
            "unknown".to_string()
        }
    }

    fn humanize_error(raw: &str) -> String {
        let text = raw.trim();
        let low = text.to_lowercase();

        if low.contains("fatal error:") && low.contains(".h: no such file or directory") {
            if let Some(start) = text.find("fatal error:") {
                let snippet = &text[start..];
                if let Some(end) = snippet.find('\n') {
                    return snippet[..end].to_string();
                }
                return snippet.to_string();
            }
        }

        if low.contains("error downloading index") || low.contains("network is unreachable") {
            return "Failed to download board or library indexes (network connection issue).".to_string();
        }

        if text.is_empty() {
            "Compilation failed with unspecified error.".to_string()
        } else {
            text.lines().take(5).collect::<Vec<_>>().join("\n")
        }
    }

    pub async fn search_libraries(&self, q: &str) -> Result<serde_json::Value, String> {
        let output = Command::new(&self.binary_path)
            .arg("lib")
            .arg("search")
            .arg(q)
            .arg("--format")
            .arg("json")
            .output()
            .await
            .map_err(|e| format!("Failed to search libraries: {e}"))?;

        if output.status.success() {
            let val: serde_json::Value = serde_json::from_slice(&output.stdout)
                .unwrap_or_else(|_| serde_json::json!({ "libraries": [] }));
            Ok(val)
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    pub async fn install_library(&self, name_or_spec: &str) -> Result<String, String> {
        let output = Command::new(&self.binary_path)
            .arg("lib")
            .arg("install")
            .arg(name_or_spec)
            .output()
            .await
            .map_err(|e| format!("Failed to install library: {e}"))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    pub async fn uninstall_library(&self, name: &str) -> Result<String, String> {
        let output = Command::new(&self.binary_path)
            .arg("lib")
            .arg("uninstall")
            .arg(name)
            .output()
            .await
            .map_err(|e| format!("Failed to uninstall library: {e}"))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    pub async fn list_libraries(&self) -> Result<serde_json::Value, String> {
        let output = Command::new(&self.binary_path)
            .arg("lib")
            .arg("list")
            .arg("--format")
            .arg("json")
            .output()
            .await
            .map_err(|e| format!("Failed to list libraries: {e}"))?;

        if output.status.success() {
            let val: serde_json::Value = serde_json::from_slice(&output.stdout)
                .unwrap_or_else(|_| serde_json::json!({ "installed_libraries": [] }));
            Ok(val)
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CANONICAL_FQBNS: &[(&str, &str)] = &[
        ("arduino-uno", "arduino:avr:uno"),
        ("arduino-nano", "arduino:avr:nano:cpu=atmega328"),
        ("arduino-mega", "arduino:avr:mega"),
        ("attiny85", "ATTinyCore:avr:attinyx5:chip=85,clock=16pll"),
        ("raspberry-pi-pico", "rp2040:rp2040:rpipico"),
        ("pi-pico-w", "rp2040:rp2040:rpipicow"),
        ("esp32", "esp32:esp32:esp32"),
        ("esp32-s3", "esp32:esp32:esp32s3"),
        ("esp32-c3", "esp32:esp32:esp32c3"),
    ];

    #[test]
    fn test_canonical_boards_count() {
        assert_eq!(CANONICAL_FQBNS.len(), 9);
    }

    #[test]
    fn test_arduino_cli_resolution() {
        let path = ArduinoCLIService::find_arduino_cli();
        assert!(path.is_file() || path.as_os_str() == "arduino-cli");
    }

    #[test]
    fn test_arduino_config_ensured() {
        let tmp = tempfile::tempdir().unwrap();
        ensure_arduino_config_in(tmp.path());
        let config_file = tmp.path().join("arduino-cli.yaml");
        assert!(config_file.exists());
        let content = std::fs::read_to_string(&config_file).unwrap();
        assert!(content.contains("package_esp32_index.json"));
        assert!(content.contains("package_rp2040_index.json"));
        assert!(content.contains("package_drazzy.com_index.json"));
    }

    #[test]
    fn test_sanitize_relative_sketch_path() {
        assert_eq!(sanitize_relative_sketch_path("sketch.ino").unwrap(), PathBuf::from("sketch.ino"));
        assert_eq!(sanitize_relative_sketch_path("src/helper.h").unwrap(), PathBuf::from("src/helper.h"));
        assert!(sanitize_relative_sketch_path("").is_err());
        assert!(sanitize_relative_sketch_path("../evil.ino").is_err());
        assert!(sanitize_relative_sketch_path("sub/../../evil.ino").is_err());
        assert!(sanitize_relative_sketch_path("/etc/passwd").is_err());
        assert!(sanitize_relative_sketch_path(r"C:\evil.ino").is_err());
    }

    async fn installed_cores(service: &ArduinoCLIService) -> String {
        let mut cmd = Command::new(&service.binary_path);
        cmd.arg("core").arg("list");
        if let Some(dir) = arduino_data_dir() {
            let cf = dir.join("arduino-cli.yaml");
            if cf.exists() {
                cmd.arg("--config-file").arg(cf);
            }
        }
        cmd.output()
            .await
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default()
    }

    #[tokio::test]
    #[ignore = "requires pre-installed arduino-cli and esp32 core"]
    async fn test_compile_esp32s3_arduino_and_espidf() {
        let service = ArduinoCLIService::new(None);
        let cores = installed_cores(&service).await;
        if !cores.contains("esp32:esp32") {
            eprintln!("[SKIP] esp32:esp32 core is not pre-installed in ~/.arduino15; skipping heavy download in test.");
            return;
        }
        let arduino_files = vec![SketchFile {
            name: "sketch.ino".to_string(),
            content: "void setup() { pinMode(LED_BUILTIN, OUTPUT); } void loop() { digitalWrite(LED_BUILTIN, HIGH); delay(500); }".to_string(),
        }];

        // Test classic ESP32 with LED_BUILTIN
        let res_esp32 = service.compile(&arduino_files, "esp32:esp32:esp32").await;
        let compile_res_esp32 = res_esp32.expect("compile esp32 classic call failed");
        assert!(
            compile_res_esp32.success,
            "Compilation failed for esp32 classic: error={:?}, stderr={}",
            compile_res_esp32.error,
            compile_res_esp32.stderr
        );

        // Verify classic ESP32 flash layout: bootloader at 0x1000, 0x0..0x1000 empty (0xFF)
        if let Some(ref b64) = compile_res_esp32.binary_content {
            use base64::Engine;
            let flash_esp32 = base64::engine::general_purpose::STANDARD.decode(b64).unwrap();
            assert_eq!(flash_esp32[0], 0xFF, "ESP32 classic flash at offset 0x0 must be 0xFF");
            assert_eq!(flash_esp32[0x1000], 0xE9, "ESP32 classic bootloader magic byte 0xE9 must be at offset 0x1000");
        }

        // Test ESP32-S3 with LED_BUILTIN
        let res = service.compile(&arduino_files, "esp32:esp32:esp32s3").await;
        let compile_res = res.expect("compile call failed");
        assert!(
            compile_res.success,
            "Compilation failed for esp32s3: error={:?}, stderr={}",
            compile_res.error,
            compile_res.stderr
        );

        // Verify ESP32-S3 flash layout: bootloader at 0x0000 (magic 0xE9), flash size 4MB or 8MB
        if let Some(ref b64) = compile_res.binary_content {
            use base64::Engine;
            let flash_s3 = base64::engine::general_purpose::STANDARD.decode(b64).unwrap();
            assert!(
                flash_s3.len() == 4 * 1024 * 1024 || flash_s3.len() == 8 * 1024 * 1024,
                "ESP32-S3 flash image size must be 4MB or 8MB, got {}",
                flash_s3.len()
            );
            assert_eq!(flash_s3[0], 0xE9, "ESP32-S3 bootloader magic byte 0xE9 must be at offset 0x0000");
            assert_eq!(flash_s3[0x10000], 0xE9, "ESP32-S3 app magic byte 0xE9 must be at offset 0x10000");
        }

        let idf_files = vec![SketchFile {
            name: "main.c".to_string(),
            content: "#include <stdio.h>\nvoid app_main(void) { printf(\"hello\\n\"); }".to_string(),
        }];

        let res_idf = service.compile(&idf_files, "esp32:esp32:esp32s3").await;
        let compile_res_idf = res_idf.expect("compile idf call failed");
        assert!(
            compile_res_idf.success,
            "Compilation failed for esp32s3 ESP-IDF: error={:?}, stderr={}",
            compile_res_idf.error,
            compile_res_idf.stderr
        );
    }


    #[tokio::test]
    #[ignore = "requires pre-installed toolchains and network access for canonical cores"]
    async fn test_compile_all_10_canonical_boards() {
        let service = ArduinoCLIService::new(None);
        let cores = installed_cores(&service).await;
        let files = vec![SketchFile {
            name: "sketch.ino".to_string(),
            content: "void setup() {} void loop() {}".to_string(),
        }];

        let mut compiled_count = 0usize;
        for (board_name, fqbn) in CANONICAL_FQBNS {
            let required_core = fqbn.split(':').take(2).collect::<Vec<_>>().join(":");
            if !cores.contains(&required_core) {
                eprintln!("[SKIP] Core {} for board {} is not pre-installed; skipping.", required_core, board_name);
                continue;
            }
            let res = service.compile(&files, fqbn).await;
            assert!(
                res.is_ok(),
                "Failed to initiate compile for board {}: {:?}",
                board_name,
                res.err()
            );
            let compile_res = res.unwrap();
            assert!(
                compile_res.success,
                "Compilation failed for board {} ({}): error={:?}, stderr={}",
                board_name,
                fqbn,
                compile_res.error,
                compile_res.stderr
            );
            compiled_count += 1;
        }
        assert!(compiled_count > 0, "At least one pre-installed canonical core should be compiled");
    }
}
