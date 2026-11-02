use std::sync::{Arc, Mutex};
use std::process::{Child, Command, Stdio};
use std::io::{BufRead, BufReader};
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

#[derive(Clone)]
pub struct ProcessManager {
    child: Arc<Mutex<Option<Child>>>,
    pub logs: Arc<Mutex<Vec<LogEntry>>>,
    pub is_running: Arc<Mutex<bool>>,
    pub server_port: Arc<Mutex<u16>>,
}

impl ProcessManager {
    pub fn new(port: u16) -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            logs: Arc::new(Mutex::new(Vec::new())),
            is_running: Arc::new(Mutex::new(false)),
            server_port: Arc::new(Mutex::new(port)),
        }
    }

    pub fn set_port(&self, port: u16) {
        *self.server_port.lock().unwrap() = port;
    }

    #[allow(dead_code)]
    pub fn get_port(&self) -> u16 {
        *self.server_port.lock().unwrap()
    }

    pub fn add_log(&self, level: &str, msg: &str) {
        let time = chrono_mock_time();
        let mut logs = self.logs.lock().unwrap();
        logs.push(LogEntry {
            timestamp: time,
            level: level.to_string(),
            message: msg.to_string(),
        });
        if logs.len() > 1000 {
            logs.remove(0);
        }
    }

    pub fn start_server(&self) {
        let mut child_guard = self.child.lock().unwrap();
        if child_guard.is_some() {
            return;
        }

        self.add_log("INFO", "Iniciando motor MCU Maker Core (Rust)...");

        // Search for mcu-maker-server binary
        let cwd = std::env::current_dir().unwrap_or_default();
        // "mcu-maker-server.exe" on Windows, "mcu-maker-server" on Linux.
        let server_exe = format!("mcu-maker-server{}", std::env::consts::EXE_SUFFIX);
        let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf()));
        let mut candidates = vec![
            cwd.join("rust").join("target").join("release").join(&server_exe),
            cwd.join("target").join("release").join(&server_exe),
            cwd.join("rust").join("target").join("debug").join(&server_exe),
            cwd.join("target").join("debug").join(&server_exe),
            cwd.join(&server_exe),
        ];

        if let Some(ref dir) = exe_dir {
            candidates.push(dir.join(&server_exe));
            candidates.push(dir.join("..").join("..").join("rust").join("target").join("release").join(&server_exe));
            candidates.push(dir.join("..").join("..").join("rust").join("target").join("debug").join(&server_exe));
            candidates.push(dir.join("..").join("..").join(&server_exe));
        }

        let mut binary = None;
        for c in candidates {
            if c.is_file() {
                binary = Some(c);
                break;
            }
        }

        let port = *self.server_port.lock().unwrap();
        let mut cmd = if let Some(bin) = binary {
            self.add_log("INFO", &format!("Ejecutando binario nativo: {:?}", bin));
            let mut c = Command::new(bin);
            c.arg("--port").arg(port.to_string());
            c.env("PORT", port.to_string());
            c
        } else {
            // Fallback: run via cargo run -p mcu-maker-server
            self.add_log("INFO", "Ejecutando servidor Rust mediante cargo run...");
            let mut c = Command::new("cargo");
            c.arg("run")
                .arg("--release")
                .arg("-p")
                .arg("mcu-maker-server")
                .arg("--manifest-path")
                .arg(cwd.join("rust").join("Cargo.toml"))
                .arg("--")
                .arg("--port")
                .arg(port.to_string());
            c.env("PORT", port.to_string());
            c
        };

        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        match cmd.spawn() {
            Ok(mut child) => {
                let stdout = child.stdout.take();
                let stderr = child.stderr.take();
                *child_guard = Some(child);
                *self.is_running.lock().unwrap() = true;
                self.add_log("SUCCESS", "Servidor MCU Maker iniciado correctamente.");

                // Stream stdout
                if let Some(out) = stdout {
                    let logs = self.logs.clone();
                    std::thread::spawn(move || {
                        let reader = BufReader::new(out);
                        for line in reader.lines().flatten() {
                            let clean_line = strip_ansi(&line);
                            if clean_line.trim().is_empty() {
                                continue;
                            }
                            let mut l = logs.lock().unwrap();
                            l.push(LogEntry {
                                timestamp: chrono_mock_time(),
                                level: "SERVER".to_string(),
                                message: clean_line,
                            });
                            if l.len() > 1000 {
                                l.remove(0);
                            }
                        }
                    });
                }

                // Stream stderr
                if let Some(err) = stderr {
                    let logs = self.logs.clone();
                    std::thread::spawn(move || {
                        let reader = BufReader::new(err);
                        for line in reader.lines().flatten() {
                            let clean_line = strip_ansi(&line);
                            if clean_line.trim().is_empty() {
                                continue;
                            }
                            let mut l = logs.lock().unwrap();
                            l.push(LogEntry {
                                timestamp: chrono_mock_time(),
                                level: "STDERR".to_string(),
                                message: clean_line,
                            });
                            if l.len() > 1000 {
                                l.remove(0);
                            }
                        }
                    });
                }
            }
            Err(e) => {
                self.add_log("ERROR", &format!("No se pudo iniciar el servidor: {}", e));
            }
        }
    }

    pub fn stop_server(&self) {
        let mut child_guard = self.child.lock().unwrap();
        if let Some(mut child) = child_guard.take() {
            self.add_log("WARN", "Deteniendo servidor MCU Maker...");
            let _ = child.kill();
            let _ = child.wait();
            *self.is_running.lock().unwrap() = false;
            self.add_log("INFO", "Servidor detenido.");
        }
    }

    pub fn restart_server(&self) {
        self.stop_server();
        std::thread::sleep(Duration::from_millis(500));
        self.start_server();
    }
}

fn chrono_mock_time() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let secs = now % 60;
    let mins = (now / 60) % 60;
    let hours = (now / 3600) % 24;
    format!("{:02}:{:02}:{:02}", hours, mins, secs)
}

fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_escape = false;
    for c in s.chars() {
        if c == '\x1b' {
            in_escape = true;
        } else if in_escape {
            if c.is_ascii_alphabetic() {
                in_escape = false;
            }
        } else {
            out.push(c);
        }
    }
    out
}
