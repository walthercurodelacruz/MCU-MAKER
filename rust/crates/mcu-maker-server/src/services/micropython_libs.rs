use std::sync::Arc;
use axum::{
    extract::Query,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

const INDEX_URL: &str = "https://micropython.org/pi/v2/index.json";
const PACKAGE_URL: &str = "https://micropython.org/pi/v2/package/py/{name}/{version}.json";
const FILE_URL: &str = "https://micropython.org/pi/v2/file/{prefix}/{hash}";

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    #[serde(default)]
    pub q: String,
}

#[derive(Debug, Deserialize)]
pub struct FetchRequest {
    pub name: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpyFile {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct FetchResponse {
    pub success: bool,
    pub name: String,
    pub version: Option<String>,
    pub files: Vec<MpyFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct MicroPythonLibsService {
    client: reqwest::Client,
    index_cache: Arc<RwLock<Option<(u64, serde_json::Value)>>>,
}

impl MicroPythonLibsService {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .unwrap_or_default(),
            index_cache: Arc::new(RwLock::new(None)),
        }
    }

    async fn get_index(&self) -> Result<serde_json::Value, String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        {
            let cache = self.index_cache.read().await;
            if let Some((ts, ref val)) = *cache {
                if now - ts < 900 {
                    return Ok(val.clone());
                }
            }
        }

        match self.client.get(INDEX_URL).send().await {
            Ok(resp) => {
                if let Ok(val) = resp.json::<serde_json::Value>().await {
                    let mut cache = self.index_cache.write().await;
                    *cache = Some((now, val.clone()));
                    Ok(val)
                } else {
                    Err("Failed to parse micropython index JSON".to_string())
                }
            }
            Err(e) => Err(format!("Failed to reach micropython index: {e}")),
        }
    }

    pub async fn search(&self, q: &str) -> serde_json::Value {
        let needle = q.trim().to_lowercase();
        let index = match self.get_index().await {
            Ok(v) => v,
            Err(e) => {
                return serde_json::json!({
                    "success": false,
                    "error": e,
                    "packages": []
                });
            }
        };

        let mut results = Vec::new();
        if let Some(packages) = index.get("packages").and_then(|p| p.as_array()) {
            for p in packages {
                let name = p.get("name").and_then(|s| s.as_str()).unwrap_or("");
                let desc = p.get("description").and_then(|s| s.as_str()).unwrap_or("");
                if needle.is_empty()
                    || name.to_lowercase().contains(&needle)
                    || desc.to_lowercase().contains(&needle)
                {
                    results.push(p.clone());
                    if results.len() >= 60 {
                        break;
                    }
                }
            }
        }

        serde_json::json!({
            "success": true,
            "packages": results
        })
    }

    pub async fn fetch(&self, req: FetchRequest) -> FetchResponse {
        let name = req.name.trim();
        let version = req.version.as_deref().unwrap_or("latest");

        let pkg_url = PACKAGE_URL
            .replace("{name}", name)
            .replace("{version}", version);

        let pkg_meta = match self.client.get(&pkg_url).send().await {
            Ok(r) => match r.json::<serde_json::Value>().await {
                Ok(j) => j,
                Err(e) => {
                    return FetchResponse {
                        success: false,
                        name: name.to_string(),
                        version: Some(version.to_string()),
                        files: vec![],
                        error: Some(format!("Failed to parse package metadata: {e}")),
                    };
                }
            },
            Err(e) => {
                return FetchResponse {
                    success: false,
                    name: name.to_string(),
                    version: Some(version.to_string()),
                    files: vec![],
                    error: Some(format!("Failed to fetch package metadata: {e}")),
                };
            }
        };

        let mut files = Vec::new();
        if let Some(hashes) = pkg_meta.get("hashes").and_then(|h| h.as_array()) {
            for entry in hashes {
                if let Some(arr) = entry.as_array() {
                    if arr.len() >= 2 {
                        let path = arr[0].as_str().unwrap_or("").to_string();
                        let digest = arr[1].as_str().unwrap_or("");
                        if digest.len() >= 2 {
                            let prefix = &digest[..2];
                            let file_url = FILE_URL
                                .replace("{prefix}", prefix)
                                .replace("{hash}", digest);

                            if let Ok(resp) = self.client.get(&file_url).send().await {
                                if let Ok(content) = resp.text().await {
                                    files.push(MpyFile { path, content });
                                }
                            }
                        }
                    }
                }
            }
        }

        FetchResponse {
            success: !files.is_empty(),
            name: name.to_string(),
            version: Some(version.to_string()),
            files,
            error: None,
        }
    }
}

pub async fn handle_mpy_search(
    axum::extract::State(svc): axum::extract::State<Arc<MicroPythonLibsService>>,
    Query(query): Query<SearchQuery>,
) -> impl IntoResponse {
    let res = svc.search(&query.q).await;
    Json(res)
}

pub async fn handle_mpy_fetch(
    axum::extract::State(svc): axum::extract::State<Arc<MicroPythonLibsService>>,
    Json(payload): Json<FetchRequest>,
) -> impl IntoResponse {
    let res = svc.fetch(payload).await;
    Json(res)
}
