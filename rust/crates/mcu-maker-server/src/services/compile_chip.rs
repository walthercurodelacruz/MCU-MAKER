use std::path::PathBuf;
use axum::{
    response::IntoResponse,
    Json,
};
use base64::Engine;
use serde::{Deserialize, Serialize};
use tokio::process::Command;

#[derive(Debug, Deserialize)]
pub struct ChipCompileRequest {
    pub source: String,
    #[allow(dead_code)]
    pub chip_json: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChipCompileResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wasm_base64: Option<String>,
    pub stdout: String,
    pub stderr: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub byte_size: usize,
}

pub struct ChipCompileService {
    wasi_sdk_clang: Option<PathBuf>,
    sdk_include: Option<PathBuf>,
}

impl ChipCompileService {
    pub fn new() -> Self {
        let wasi_sdk_clang = Self::find_clang();
        let sdk_include = Self::find_sdk_include();
        Self {
            wasi_sdk_clang,
            sdk_include,
        }
    }

    fn find_clang() -> Option<PathBuf> {
        if let Ok(p) = std::env::var("WASI_SDK") {
            let pb = PathBuf::from(p).join("bin").join(format!("clang{}", std::env::consts::EXE_SUFFIX));
            if pb.is_file() {
                return Some(pb);
            }
        }
        #[cfg(windows)]
        let candidates: [&str; 3] = [
            r"C:\wasi-sdk\bin\clang.exe",
            r"C:\Program Files\wasi-sdk\bin\clang.exe",
            r"C:\Program Files\LLVM\bin\clang.exe",
        ];
        #[cfg(not(windows))]
        let candidates: [&str; 4] = [
            "/opt/wasi-sdk/bin/clang",
            "/usr/local/wasi-sdk/bin/clang",
            "/usr/lib/llvm/bin/clang",
            "/usr/bin/clang",
        ];
        for cand in candidates {
            let p = PathBuf::from(cand);
            if p.is_file() {
                return Some(p);
            }
        }
        None
    }

    fn find_sdk_include() -> Option<PathBuf> {
        let candidates = [
            PathBuf::from("sdk"),
            PathBuf::from("../sdk"),
            PathBuf::from("../../sdk"),
        ];
        for cand in candidates {
            if cand.join("mcu_maker_chip.h").is_file() || cand.join("velxio_chip.h").is_file() {
                return Some(cand);
            }
        }
        None
    }

    pub fn status(&self) -> serde_json::Value {
        serde_json::json!({
            "available": self.wasi_sdk_clang.is_some() && self.sdk_include.is_some(),
            "wasi_sdk": self.wasi_sdk_clang.as_ref().map(|p| p.to_string_lossy().to_string()),
            "sdk_include": self.sdk_include.as_ref().map(|p| p.to_string_lossy().to_string()),
        })
    }

    pub async fn compile(&self, source: &str) -> ChipCompileResponse {
        let (clang, sdk) = match (&self.wasi_sdk_clang, &self.sdk_include) {
            (Some(c), Some(s)) => (c, s),
            _ => {
                return ChipCompileResponse {
                    success: false,
                    wasm_base64: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    error: Some("WASI-SDK clang or mcu_maker_chip.h is not found on host.".to_string()),
                    byte_size: 0,
                };
            }
        };

        let temp_dir = match tempfile::tempdir() {
            Ok(d) => d,
            Err(e) => {
                return ChipCompileResponse {
                    success: false,
                    wasm_base64: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    error: Some(format!("Failed to create tempdir: {e}")),
                    byte_size: 0,
                };
            }
        };

        let src_path = temp_dir.path().join("chip.c");
        let wasm_path = temp_dir.path().join("chip.wasm");
        if let Err(e) = tokio::fs::write(&src_path, source).await {
            return ChipCompileResponse {
                success: false,
                wasm_base64: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(format!("Failed to write chip source: {e}")),
                byte_size: 0,
            };
        }

        let mut cmd = Command::new(clang);
        cmd.arg("--target=wasm32-unknown-wasip1")
            .arg("-O2")
            .arg("-nostartfiles")
            .arg("-Wl,--import-memory")
            .arg("-Wl,--export-table")
            .arg("-Wl,--no-entry")
            .arg("-Wl,--export=chip_setup")
            .arg("-Wl,--allow-undefined")
            .arg("-I")
            .arg(sdk)
            .arg(&src_path)
            .arg("-o")
            .arg(&wasm_path);

        match cmd.output().await {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                if out.status.success() && wasm_path.is_file() {
                    let bytes = tokio::fs::read(&wasm_path).await.unwrap_or_default();
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    let size = bytes.len();
                    ChipCompileResponse {
                        success: true,
                        wasm_base64: Some(b64),
                        stdout,
                        stderr,
                        error: None,
                        byte_size: size,
                    }
                } else {
                    ChipCompileResponse {
                        success: false,
                        wasm_base64: None,
                        stdout,
                        stderr,
                        error: Some("WASM compilation failed".to_string()),
                        byte_size: 0,
                    }
                }
            }
            Err(e) => ChipCompileResponse {
                success: false,
                wasm_base64: None,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(format!("Failed to execute clang: {e}")),
                byte_size: 0,
            },
        }
    }
}

pub async fn handle_compile_chip_status(
    axum::extract::State(service): axum::extract::State<std::sync::Arc<ChipCompileService>>,
) -> impl IntoResponse {
    Json(service.status())
}

pub async fn handle_compile_chip(
    axum::extract::State(service): axum::extract::State<std::sync::Arc<ChipCompileService>>,
    Json(payload): Json<ChipCompileRequest>,
) -> impl IntoResponse {
    let res = service.compile(&payload.source).await;
    Json(res)
}
