use std::sync::Arc;
use axum::{
    extract::{Query, State},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use super::arduino_cli::ArduinoCLIService;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Debug, Deserialize)]
pub struct InstallRequest {
    pub name: String,
    pub version: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UninstallRequest {
    pub name: String,
}

#[allow(dead_code)]
#[derive(Debug, Serialize)]
pub struct LibraryOpResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub libraries: Option<serde_json::Value>,
}

pub async fn handle_library_search(
    State(cli): State<Arc<ArduinoCLIService>>,
    Query(query): Query<SearchQuery>,
) -> impl IntoResponse {
    match cli.search_libraries(&query.q).await {
        Ok(json) => {
            let libs = json.get("libraries").cloned().unwrap_or(serde_json::json!([]));
            Json(serde_json::json!({
                "success": true,
                "libraries": libs
            }))
        }
        Err(e) => Json(serde_json::json!({
            "success": false,
            "error": e,
            "libraries": []
        })),
    }
}

pub async fn handle_library_install(
    State(cli): State<Arc<ArduinoCLIService>>,
    Json(payload): Json<InstallRequest>,
) -> impl IntoResponse {
    let spec = if let Some(v) = &payload.version {
        format!("{}@{}", payload.name, v)
    } else {
        payload.name
    };

    match cli.install_library(&spec).await {
        Ok(stdout) => Json(serde_json::json!({
            "success": true,
            "stdout": stdout,
        })),
        Err(e) => Json(serde_json::json!({
            "success": false,
            "error": e,
        })),
    }
}

pub async fn handle_library_uninstall(
    State(cli): State<Arc<ArduinoCLIService>>,
    Json(payload): Json<UninstallRequest>,
) -> impl IntoResponse {
    match cli.uninstall_library(&payload.name).await {
        Ok(stdout) => Json(serde_json::json!({
            "success": true,
            "stdout": stdout,
        })),
        Err(e) => Json(serde_json::json!({
            "success": false,
            "error": e,
        })),
    }
}

pub async fn handle_library_list(
    State(cli): State<Arc<ArduinoCLIService>>,
) -> impl IntoResponse {
    match cli.list_libraries().await {
        Ok(json) => {
            let libs = json.get("installed_libraries").cloned().unwrap_or(serde_json::json!([]));
            Json(serde_json::json!({
                "success": true,
                "libraries": libs
            }))
        }
        Err(e) => Json(serde_json::json!({
            "success": false,
            "error": e,
            "libraries": []
        })),
    }
}
