use std::path::{Path, PathBuf};
use std::sync::Arc;
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WiFiConfig {
    #[serde(default = "default_ssid")]
    pub ssid: String,
    #[serde(default = "default_empty")]
    pub password: String,
    #[serde(default = "default_true")]
    pub universal_redirect: bool,
    #[serde(default = "default_virtual_ap")]
    pub virtual_ap_name: String,
    #[serde(default = "default_channel")]
    pub virtual_channel: u32,
}

fn default_ssid() -> String {
    "TU_RED_WIFI".to_string()
}

fn default_empty() -> String {
    String::new()
}

fn default_true() -> bool {
    true
}

fn default_virtual_ap() -> String {
    "Espressif".to_string()
}

fn default_channel() -> u32 {
    5
}

impl Default for WiFiConfig {
    fn default() -> Self {
        Self {
            ssid: default_ssid(),
            password: default_empty(),
            universal_redirect: default_true(),
            virtual_ap_name: default_virtual_ap(),
            virtual_channel: default_channel(),
        }
    }
}

impl WiFiConfig {
    pub fn file_path() -> PathBuf {
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let candidate = cwd.join("wifi_config.json");
        if candidate.exists() {
            return candidate;
        }
        if let Some(parent) = cwd.parent() {
            let p_cand = parent.join("wifi_config.json");
            if p_cand.exists() {
                return p_cand;
            }
        }
        cwd.join("wifi_config.json")
    }

    pub fn load() -> Self {
        let p = Self::file_path();
        if let Ok(bytes) = std::fs::read(&p) {
            if let Ok(cfg) = serde_json::from_slice::<WiFiConfig>(&bytes) {
                return cfg;
            }
        }
        let def = Self::default();
        let _ = def.save(&p);
        def
    }

    pub fn save(&self, path: &Path) -> Result<(), std::io::Error> {
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json)?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct WiFiConfigService {
    pub config: Arc<RwLock<WiFiConfig>>,
}

impl WiFiConfigService {
    pub fn new() -> Self {
        let initial = WiFiConfig::load();
        Self {
            config: Arc::new(RwLock::new(initial)),
        }
    }

    pub async fn get(&self) -> WiFiConfig {
        self.config.read().await.clone()
    }

    pub async fn update(&self, new_cfg: WiFiConfig) -> Result<(), String> {
        let path = WiFiConfig::file_path();
        new_cfg.save(&path).map_err(|e| format!("Failed to save wifi config: {e}"))?;
        let mut guard = self.config.write().await;
        *guard = new_cfg;
        info!("Updated Wi-Fi configuration saved to {:?}", path);
        Ok(())
    }
}

pub async fn handle_get_wifi_config(
    State(service): State<Arc<WiFiConfigService>>,
) -> impl IntoResponse {
    let cfg = service.get().await;
    Json(cfg)
}

pub async fn handle_update_wifi_config(
    State(service): State<Arc<WiFiConfigService>>,
    Json(new_cfg): Json<WiFiConfig>,
) -> impl IntoResponse {
    match service.update(new_cfg).await {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}
