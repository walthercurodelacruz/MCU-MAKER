use std::path::PathBuf;
use std::process::Stdio;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tracing::info;

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

#[derive(Clone)]
pub struct ArduinoCLIService {
    pub binary_path: PathBuf,
}

impl ArduinoCLIService {
    pub fn new(configured_path: Option<String>) -> Self {
        let binary_path = if let Some(path) = configured_path {
            PathBuf::from(path)
        } else if let Ok(path) = std::env::var("ARDUINO_CLI_BIN") {
            PathBuf::from(path)
        } else {
            Self::find_arduino_cli()
        };

        info!("Arduino CLI binary resolved to: {:?}", binary_path);
        Self { binary_path }
    }

    pub fn find_arduino_cli() -> PathBuf {
        // 0. Check bundled or local prebuilt arduino-cli
        if let Ok(cur_exe) = std::env::current_exe() {
            if let Some(parent) = cur_exe.parent() {
                for relative in [
                    parent.join("arduino-cli.exe"),
                    parent.join("prebuilt").join("arduino-cli").join("arduino-cli.exe"),
                    parent.join("..").join("prebuilt").join("arduino-cli").join("arduino-cli.exe"),
                    parent.join("..").join("..").join("prebuilt").join("arduino-cli").join("arduino-cli.exe"),
                ] {
                    if relative.is_file() {
                        return relative;
                    }
                }
            }
        }

        // 1. Check PATH
        if let Ok(output) = std::process::Command::new("where.exe")
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

        // 2. Check conventional Arduino IDE installations on Windows
        let candidates = [
            r"C:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe",
            r"C:\Program Files (x86)\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe",
            r"C:\arduino-cli\arduino-cli.exe",
        ];

        for cand in candidates {
            let p = PathBuf::from(cand);
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
        // Determine primary ino name and stem for directory naming.
        // Arduino CLI requires that the directory name matches the primary .ino file.
        let mut main_ino_name = "sketch.ino".to_string();
        for f in files {
            if f.name.ends_with(".ino") {
                main_ino_name = f.name.clone();
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

        let mut has_wifi_code = false;
        for f in files {
            let target_path = sketch_dir.join(&f.name);
            if let Some(parent) = target_path.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }

            let mut content = f.content.clone();

            // ESP32: normalize WiFi for QEMU simulation
            if is_esp32 && (f.name.ends_with(".ino") || f.name.ends_with(".cpp")) {
                let should_rewrite = if wifi_cfg.universal_redirect {
                    true
                } else {
                    content.contains(&wifi_cfg.ssid) || content.contains(&wifi_cfg.virtual_ap_name)
                };

                if should_rewrite {
                    content = re_wifi.replace_all(&content, target_wifi_call.as_str()).to_string();
                    // Also support ESP-IDF wifi_config_t initializers if present
                    if let Ok(re_idf_ssid) = regex::Regex::new(r#"(\.ssid\s*=\s*)"[^"]*""#) {
                        let rep = format!(r#"${{1}}"{virtual_ap}""#, virtual_ap = wifi_cfg.virtual_ap_name);
                        content = re_idf_ssid.replace_all(&content, rep.as_str()).to_string();
                    }
                    if let Ok(re_idf_pass) = regex::Regex::new(r#"(\.password\s*=\s*)"[^"]*""#) {
                        content = re_idf_pass.replace_all(&content, r#"${1}""""#).to_string();
                    }
                }
            }

            // RP2040: redirect Serial -> Serial1 in main sketch
            if is_rp2040 && (f.name == "sketch.ino" || f.name == main_ino_name) {
                if !content.contains("#define Serial Serial1") {
                    content = format!("#define Serial Serial1\n{}", content);
                }
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
            }
            if is_rp2040 && !content.contains("#define Serial Serial1") {
                content = format!("#define Serial Serial1\n{}", content);
            }
            tokio::fs::write(&primary_ino, &content)
                .await
                .map_err(|e| format!("Failed to write primary ino: {e}"))?;
        }

        let mut effective_fqbn = board_fqbn.to_string();
        if is_esp32 && !effective_fqbn.contains("FlashMode") {
            effective_fqbn = format!("{}:FlashMode=dio", effective_fqbn);
        }

        let mut cmd = Command::new(&self.binary_path);
        cmd.arg("compile")
            .arg("--fqbn")
            .arg(&effective_fqbn);

        if is_esp32 {
            cmd.arg("--build-property")
                .arg("build.extra_flags=-DARDUINO_ESP32_LCGAMBOA=1")
                .arg("--build-property")
                .arg("compiler.cpp.extra_flags=-DBitOrder=uint8_t");
        }

        cmd.arg("--output-dir")
            .arg(&output_dir)
            .arg(&sketch_dir)
            .arg("--verbose")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let output = cmd.output().await.map_err(|e| {
            format!(
                "Failed to execute arduino-cli at {:?}: {}",
                self.binary_path, e
            )
        })?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let success = output.status.success();

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
                    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
                        let esp_pkg = PathBuf::from(local_appdata).join("Arduino15").join("packages").join("esp32");
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

                    const FLASH_SIZE: usize = 4 * 1024 * 1024;
                    let mut flash = vec![0xFFu8; FLASH_SIZE];
                    let is_c3 = board_fqbn.contains("esp32c3") || board_fqbn.contains("c3");
                    let bootloader_offset = if is_c3 { 0x0000 } else { 0x1000 };

                    if let Ok(b_bytes) = tokio::fs::read(&bootloader_file).await {
                        let end = (bootloader_offset + b_bytes.len()).min(FLASH_SIZE);
                        flash[bootloader_offset..end].copy_from_slice(&b_bytes[..end - bootloader_offset]);
                    }
                    if let Ok(p_bytes) = tokio::fs::read(&partitions_file).await {
                        let end = (0x8000 + p_bytes.len()).min(FLASH_SIZE);
                        flash[0x8000..end].copy_from_slice(&p_bytes[..end - 0x8000]);
                    }
                    if let Some(ref ba_path) = boot_app0_path {
                        if let Ok(ba_bytes) = tokio::fs::read(ba_path).await {
                            let end = (0xe000 + ba_bytes.len()).min(FLASH_SIZE);
                            flash[0xe000..end].copy_from_slice(&ba_bytes[..end - 0xe000]);
                        }
                    }
                    if let Ok(app_bytes) = tokio::fs::read(&bin_file).await {
                        let end = (0x10000 + app_bytes.len()).min(FLASH_SIZE);
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
            let uf2_path = output_dir.join("sketch.ino.uf2");
            let bin_path = output_dir.join("sketch.ino.bin");
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
