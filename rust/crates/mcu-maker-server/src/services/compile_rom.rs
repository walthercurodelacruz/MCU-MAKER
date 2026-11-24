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
    for (idx, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if !line.starts_with(':') {
            continue;
        }
        if !line.is_ascii() {
            return Err(format!("Non-ASCII characters on Intel HEX line {}", idx + 1));
        }
        if line.len() < 11 {
            return Err(format!("Truncated Intel HEX record on line {}", idx + 1));
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

        let data_end = 9 + length * 2;
        if line.len() < data_end + 2 {
            return Err(format!(
                "Intel HEX record length mismatch on line {} (expected at least {} chars, got {})",
                idx + 1,
                data_end + 2,
                line.len()
            ));
        }
        let data_hex = &line[9..data_end];
        let data = hex::decode(data_hex).map_err(|e| e.to_string())?;

        let end = addr.checked_add(data.len()).ok_or_else(|| "Intel HEX address overflow".to_string())?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_intel_hex_valid_and_malformed() {
        let valid = ":02000000ABCD86\n:00000001FF\n";
        assert_eq!(parse_intel_hex(valid).unwrap(), vec![0xAB, 0xCD]);

        // Must return Err instead of panicking on oversized byte count or truncated line
        assert!(parse_intel_hex(":FF000000\n").is_err());
        assert!(parse_intel_hex(":02000000AB\n").is_err());
        assert!(parse_intel_hex(":02\n").is_err());
        assert!(parse_intel_hex(":02000000éé\n").is_err());
    }
}
