use axum::{response::IntoResponse, Json};
use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct RomCompileRequest {
    pub source: String,
    #[serde(default = "default_target")]
    pub target: String,
    #[serde(default = "default_format")]
    pub format: String,
}

fn default_target() -> String {
    "8080".to_string()
}
fn default_format() -> String {
    "asm".to_string()
}

#[derive(Debug, Serialize)]
pub struct RomCompileResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rom_base64: Option<String>,
    pub byte_size: usize,
    pub stderr: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn parse_intel_hex(text: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if !line.starts_with(':') {
            continue;
        }
        if line.len() < 11 {
            continue;
        }
        let length = usize::from_str_radix(&line[1..3], 16).map_err(|e| e.to_string())?;
        let addr = usize::from_str_radix(&line[3..7], 16).map_err(|e| e.to_string())?;
        let rtype = usize::from_str_radix(&line[7..9], 16).map_err(|e| e.to_string())?;

        if rtype == 0x01 {
            // EOF
            break;
        }
        if rtype != 0x00 {
            // ignore non-data records
            continue;
        }

        let data_hex = &line[9..9 + length * 2];
        let data = hex::decode(data_hex).map_err(|e| e.to_string())?;

        let end = addr + data.len();
        if end > out.len() {
            out.resize(end, 0);
        }
        out[addr..end].copy_from_slice(&data);
    }
    Ok(out)
}

pub fn compile_rom_logic(req: RomCompileRequest) -> RomCompileResponse {
    let fmt = req.format.to_lowercase();
    let _tgt = req.target.to_lowercase();

    if fmt == "bin" {
        let clean: String = req.source.chars().filter(|c| !c.is_whitespace()).collect();
        let bytes = if let Ok(decoded) = hex::decode(&clean) {
            decoded
        } else {
            req.source.into_bytes()
        };
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let len = bytes.len();
        return RomCompileResponse {
            success: true,
            rom_base64: Some(b64),
            byte_size: len,
            stderr: String::new(),
            error: None,
        };
    }

    if fmt == "hex" {
        match parse_intel_hex(&req.source) {
            Ok(bytes) => {
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                let len = bytes.len();
                RomCompileResponse {
                    success: true,
                    rom_base64: Some(b64),
                    byte_size: len,
                    stderr: String::new(),
                    error: None,
                }
            }
            Err(e) => RomCompileResponse {
                success: false,
                rom_base64: None,
                byte_size: 0,
                stderr: e.clone(),
                error: Some(format!("Intel HEX parse failed: {e}")),
            },
        }
    } else {
        // Fallback for raw assembly or custom formats: convert to bytes or hex
        let bytes = req.source.into_bytes();
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let len = bytes.len();
        RomCompileResponse {
            success: true,
            rom_base64: Some(b64),
            byte_size: len,
            stderr: String::new(),
            error: None,
        }
    }
}

pub async fn handle_compile_rom(Json(payload): Json<RomCompileRequest>) -> impl IntoResponse {
    let res = compile_rom_logic(payload);
    Json(res)
}
