use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub frontend_dist: PathBuf,
    pub artifact_cache_dir: PathBuf,
    pub arduino_cli_path: Option<String>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        let mut check_dirs = Vec::new();
        if let Ok(cwd) = std::env::current_dir() {
            check_dirs.push(cwd);
        }
        if let Ok(cur_exe) = std::env::current_exe() {
            if let Some(p) = cur_exe.parent() {
                check_dirs.push(p.to_path_buf());
            }
        }

        let mut project_root = PathBuf::from(".");
        for dir in check_dirs {
            let mut curr = Some(dir.as_path());
            while let Some(p) = curr {
                if p.join("frontend").join("dist").is_dir()
                    || p.join("rust").join("Cargo.toml").is_file()
                    || p.join("artifacts").is_dir()
                {
                    project_root = p.to_path_buf();
                    break;
                }
                curr = p.parent();
            }
            if project_root != PathBuf::from(".") {
                break;
            }
        }

        let dist = if project_root.join("frontend").join("dist").is_dir() {
            project_root.join("frontend").join("dist")
        } else if project_root.join("dist").is_dir() {
            project_root.join("dist")
        } else {
            project_root.join("frontend").join("dist")
        };

        let cache = if let Ok(env_cache) = std::env::var("MCU_MAKER_ARTIFACT_CACHE") {
            PathBuf::from(env_cache)
        } else {
            project_root.join("artifacts")
        };

        Self {
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8001),
            frontend_dist: dist,
            artifact_cache_dir: cache,
            arduino_cli_path: std::env::var("ARDUINO_CLI_BIN").ok(),
        }
    }
}

impl ServerConfig {
    pub fn from_args_and_env() -> Self {
        let mut cfg = Self::default();
        let args: Vec<String> = std::env::args().collect();
        let mut i = 1;
        while i < args.len() {
            match args[i].as_str() {
                "--port" | "-p" => {
                    if i + 1 < args.len() {
                        if let Ok(p) = args[i + 1].parse() {
                            cfg.port = p;
                        }
                        i += 1;
                    }
                }
                "--host" | "-h" => {
                    if i + 1 < args.len() {
                        cfg.host = args[i + 1].clone();
                        i += 1;
                    }
                }
                "--dist" => {
                    if i + 1 < args.len() {
                        cfg.frontend_dist = PathBuf::from(&args[i + 1]);
                        i += 1;
                    }
                }
                "--cache" => {
                    if i + 1 < args.len() {
                        cfg.artifact_cache_dir = PathBuf::from(&args[i + 1]);
                        i += 1;
                    }
                }
                _ => {
                    if let Some(val) = args[i].strip_prefix("--port=") {
                        if let Ok(p) = val.parse() {
                            cfg.port = p;
                        }
                    } else if let Some(val) = args[i].strip_prefix("--host=") {
                        cfg.host = val.to_string();
                    }
                }
            }
            i += 1;
        }
        cfg
    }
}
