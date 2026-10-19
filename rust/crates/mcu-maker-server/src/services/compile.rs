use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::RwLock;
use tracing::info;

use super::arduino_cli::{ArduinoCLIService, CompileResult, SketchFile};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CompileRequest {
    #[serde(default)]
    pub files: Option<Vec<SketchFile>>,
    #[serde(default, alias = "source", alias = "sketch", alias = "ino")]
    pub code: Option<String>,
    #[serde(default, alias = "board_fqbn")]
    pub board: Option<String>,
    #[serde(default)]
    pub libraries: Option<Vec<String>>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub board_kind: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub example_id: Option<String>,
    #[serde(default)]
    pub board_options: Option<serde_json::Value>,
    #[serde(default)]
    pub spiffs_files: Option<serde_json::Value>,
    #[serde(default)]
    pub custom_wifi_ssids: Option<Vec<String>>,
    #[serde(default)]
    pub initiated_by: Option<String>,
}

impl CompileRequest {
    pub fn resolved_board(&self) -> String {
        let raw = self.board.as_deref().unwrap_or("arduino:avr:uno").trim();
        match raw {
            "esp32" | "esp32-devkit" | "esp32dev" => "esp32:esp32:esp32".to_string(),
            "esp32s3" | "esp32-s3" => "esp32:esp32:esp32s3".to_string(),
            "esp32c3" | "esp32-c3" => "esp32:esp32:esp32c3".to_string(),
            "esp32cam" | "esp32-cam" => "esp32:esp32:esp32cam".to_string(),
            "uno" => "arduino:avr:uno".to_string(),
            "nano" => "arduino:avr:nano".to_string(),
            "mega" => "arduino:avr:mega".to_string(),
            "pico" | "rp2040" => "rp2040:rp2040:rpipico".to_string(),
            other => other.to_string(),
        }
    }

    pub fn resolved_files(&self) -> Vec<SketchFile> {
        if let Some(ref fs) = self.files {
            if !fs.is_empty() {
                return fs.clone();
            }
        }
        if let Some(ref code) = self.code {
            vec![SketchFile {
                name: "sketch.ino".to_string(),
                content: code.clone(),
            }]
        } else {
            vec![]
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AsyncJobStatus {
    pub job_id: String,
    pub state: String, // "pending" | "running" | "done" | "error"
    pub stage: Option<String>,
    pub started_at: f64,
    pub stdout: String,
    pub result: Option<CompileResult>,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct CompileService {
    arduino_cli: Arc<ArduinoCLIService>,
    artifact_cache_dir: PathBuf,
    jobs: Arc<RwLock<HashMap<String, AsyncJobStatus>>>,
}

impl CompileService {
    pub fn new(arduino_cli: Arc<ArduinoCLIService>, artifact_cache_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&artifact_cache_dir);
        Self {
            arduino_cli,
            artifact_cache_dir,
            jobs: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn compute_cache_key(files: &[SketchFile], board: &str, salt: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(board.as_bytes());
        hasher.update(salt.as_bytes());
        for f in files {
            hasher.update(f.name.as_bytes());
            hasher.update(f.content.as_bytes());
        }
        hex::encode(hasher.finalize())
    }

    pub async fn clear_cache(&self) {
        if let Ok(mut entries) = tokio::fs::read_dir(&self.artifact_cache_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    let _ = tokio::fs::remove_file(path).await;
                }
            }
        }
        info!("Artifact cache cleared successfully");
    }

    pub async fn load_cached(&self, key: &str) -> Option<CompileResult> {
        let file_path = self.artifact_cache_dir.join(format!("{key}.json"));
        if let Ok(bytes) = tokio::fs::read(&file_path).await {
            if let Ok(res) = serde_json::from_slice::<CompileResult>(&bytes) {
                return Some(res);
            }
        }
        None
    }

    pub async fn save_cached(&self, key: &str, res: &CompileResult) {
        if !res.success {
            return;
        }
        let file_path = self.artifact_cache_dir.join(format!("{key}.json"));
        if let Ok(json) = serde_json::to_vec(res) {
            let _ = tokio::fs::write(&file_path, json).await;
        }
    }

    pub async fn execute_compile(&self, req: CompileRequest) -> CompileResult {
        let board = req.resolved_board();
        let files = req.resolved_files();

        // Limpiar cachés y compilados anteriores antes de compilar
        self.clear_cache().await;

        let wifi_cfg = super::wifi_config::WiFiConfig::load();
        let salt = format!("v4:{}:{}:{}", wifi_cfg.ssid, wifi_cfg.universal_redirect, wifi_cfg.virtual_ap_name);
        let cache_key = Self::compute_cache_key(&files, &board, &salt);

        info!("Starting compilation for board {}", board);
        match self.arduino_cli.compile(&files, &board).await {
            Ok(res) => {
                if res.success {
                    self.save_cached(&cache_key, &res).await;
                }
                res
            }
            Err(e) => CompileResult {
                success: false,
                hex_content: None,
                binary_content: None,
                binary_type: None,
                uf2_content: None,
                has_wifi: None,
                stdout: String::new(),
                stderr: e.clone(),
                error: Some(e),
                error_kind: Some("internal_error".to_string()),
            },
        }
    }

    pub async fn start_async_job(&self, req: CompileRequest) -> String {
        let job_id = uuid::Uuid::new_v4().to_string();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64();

        let initial_status = AsyncJobStatus {
            job_id: job_id.clone(),
            state: "running".to_string(),
            stage: Some("compiling".to_string()),
            started_at: now,
            stdout: String::new(),
            result: None,
            error: None,
        };

        {
            let mut jobs = self.jobs.write().await;
            jobs.insert(job_id.clone(), initial_status);
        }

        let this = self.clone();
        let jid = job_id.clone();
        tokio::spawn(async move {
            let result = this.execute_compile(req).await;
            let mut jobs = this.jobs.write().await;
            if let Some(job) = jobs.get_mut(&jid) {
                job.state = if result.success {
                    "done".to_string()
                } else {
                    "error".to_string()
                };
                job.stage = Some("done".to_string());
                job.stdout = result.stdout.clone();
                job.error = if result.success {
                    None
                } else {
                    result.error.clone().or_else(|| Some("Compilation failed".to_string()))
                };
                job.result = Some(result);
            }
        });

        job_id
    }

    pub async fn get_job_status(&self, job_id: &str) -> Option<AsyncJobStatus> {
        let jobs = self.jobs.read().await;
        jobs.get(job_id).cloned()
    }
}

// ── HTTP Handlers ───────────────────────────────────────────────────────────

pub async fn handle_compile_sync(
    State(service): State<Arc<CompileService>>,
    Json(payload): Json<CompileRequest>,
) -> impl IntoResponse {
    let result = service.execute_compile(payload).await;
    Json(result)
}

pub async fn handle_compile_start(
    State(service): State<Arc<CompileService>>,
    Json(payload): Json<CompileRequest>,
) -> impl IntoResponse {
    let job_id = service.start_async_job(payload).await;
    Json(serde_json::json!({ "job_id": job_id }))
}

pub async fn handle_compile_status(
    State(service): State<Arc<CompileService>>,
    Path(job_id): Path<String>,
) -> impl IntoResponse {
    if let Some(status) = service.get_job_status(&job_id).await {
        Json(serde_json::json!({
            "job_id": status.job_id,
            "state": status.state,
            "stage": status.stage,
            "started_at": status.started_at,
            "stdout": status.stdout,
            "result": status.result,
            "error": status.error
        })).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "detail": "Job not found" })),
        ).into_response()
    }
}

pub async fn handle_cache_clear(
    State(service): State<Arc<CompileService>>,
) -> impl IntoResponse {
    service.clear_cache().await;
    Json(serde_json::json!({ "success": true, "message": "Cache cleared" }))
}
