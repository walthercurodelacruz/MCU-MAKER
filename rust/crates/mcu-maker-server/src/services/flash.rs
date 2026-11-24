use std::convert::Infallible;
use std::process::Stdio;
use std::sync::Arc;
use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    response::sse::{Event, KeepAlive, Sse},
    Json,
};
use futures_util::stream::Stream;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio_stream::wrappers::ReceiverStream;

use super::arduino_cli::ArduinoCLIService;

fn json_err(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<serde_json::Value>) {
    (status, Json(serde_json::json!({ "detail": msg.into() })))
}

pub async fn handle_flash_upload(
    State(cli): State<Arc<ArduinoCLIService>>,
    mut multipart: Multipart,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, (StatusCode, Json<serde_json::Value>)> {
    let mut port = String::new();
    let mut fqbn = String::new();
    let mut format = "hex".to_string();
    let mut program_bytes = Vec::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "port" => {
                if let Ok(text) = field.text().await {
                    port = text;
                }
            }
            "fqbn" => {
                if let Ok(text) = field.text().await {
                    fqbn = text;
                }
            }
            "program_format" => {
                if let Ok(text) = field.text().await {
                    format = text;
                }
            }
            "program" => {
                if let Ok(bytes) = field.bytes().await {
                    program_bytes = bytes.to_vec();
                }
            }
            _ => {}
        }
    }

    if port.is_empty() || fqbn.is_empty() || program_bytes.is_empty() {
        return Err(json_err(
            StatusCode::BAD_REQUEST,
            "Missing port, fqbn, or program file",
        ));
    }

    let ext = match format.as_str() {
        "bin" => ".bin",
        "uf2" => ".uf2",
        "elf" => ".elf",
        _ => ".hex",
    };

    let temp_file = tempfile::Builder::new()
        .prefix("mcu-maker-flash-")
        .suffix(ext)
        .tempfile()
        .map_err(|e| json_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let file_path = temp_file.path().to_path_buf();
    tokio::fs::write(&file_path, &program_bytes)
        .await
        .map_err(|e| json_err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(100);
    let cli_bin = cli.binary_path.clone();

    tokio::spawn(async move {
        let _keep_file = temp_file; // Keep temp file until task finishes
        let started = std::time::Instant::now();

        let cmd_str = format!("arduino-cli upload -p {} --fqbn {} -i {:?}", port, fqbn, file_path);
        let _ = tx
            .send(Ok(Event::default().data(serde_json::json!({
                "phase": "starting",
                "line": format!("$ {}", cmd_str)
            }).to_string())))
            .await;

        let mut child = match Command::new(&cli_bin)
            .arg("upload")
            .arg("-p")
            .arg(&port)
            .arg("--fqbn")
            .arg(&fqbn)
            .arg("-i")
            .arg(&file_path)
            .arg("-v")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                let _ = tx
                    .send(Ok(Event::default().data(serde_json::json!({
                        "phase": "done",
                        "success": false,
                        "elapsed_ms": started.elapsed().as_millis() as u64,
                        "error": format!("Failed to spawn arduino-cli: {e}")
                    }).to_string())))
                    .await;
                return;
            }
        };

        let last_err = Arc::new(tokio::sync::Mutex::new(Option::<String>::None));

        let stdout_task = child.stdout.take().map(|stdout| {
            let tx_out = tx.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let _ = tx_out
                        .send(Ok(Event::default().data(serde_json::json!({
                            "phase": "writing",
                            "line": line
                        }).to_string())))
                        .await;
                }
            })
        });

        let stderr_task = child.stderr.take().map(|stderr| {
            let tx_err = tx.clone();
            let last_err_ref = last_err.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    if !line.trim().is_empty() {
                        *last_err_ref.lock().await = Some(line.clone());
                    }
                    let _ = tx_err
                        .send(Ok(Event::default().data(serde_json::json!({
                            "phase": "writing",
                            "line": line
                        }).to_string())))
                        .await;
                }
            })
        });

        let status = child.wait().await;
        if let Some(t) = stdout_task {
            let _ = t.await;
        }
        if let Some(t) = stderr_task {
            let _ = t.await;
        }

        let success = status.map(|s| s.success()).unwrap_or(false);
        let elapsed_ms = started.elapsed().as_millis() as u64;

        let done_payload = if success {
            serde_json::json!({
                "phase": "done",
                "success": true,
                "elapsed_ms": elapsed_ms
            })
        } else {
            let err_msg = last_err
                .lock()
                .await
                .clone()
                .unwrap_or_else(|| "Upload failed".to_string());
            serde_json::json!({
                "phase": "done",
                "success": false,
                "elapsed_ms": elapsed_ms,
                "error": err_msg
            })
        };

        let _ = tx.send(Ok(Event::default().data(done_payload.to_string()))).await;
    });

    Ok(Sse::new(ReceiverStream::new(rx)).keep_alive(KeepAlive::default()))
}
