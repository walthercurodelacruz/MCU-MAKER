use std::sync::{Arc, Mutex, MutexGuard};
use std::process::{Child, Command, Stdio};
use std::io::{BufRead, BufReader};
use std::time::Duration;

fn lock_unpoisoned<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

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
        *lock_unpoisoned(&self.server_port) = port;
    }

    #[allow(dead_code)]
    pub fn get_port(&self) -> u16 {
        *lock_unpoisoned(&self.server_port)
    }

    /// Checks live child state (detects unexpected exits) and returns whether the server is running.
    pub fn is_server_running(&self) -> bool {
        let mut child_guard = lock_unpoisoned(&self.child);
        if let Some(child) = child_guard.as_mut() {
            match child.try_wait() {
                Ok(Some(status)) => {
                    *child_guard = None;
                    *lock_unpoisoned(&self.is_running) = false;
                    drop(child_guard);
                    self.add_log("WARN", &format!("El servidor MCU Maker finalizó ({})", status));
                    return false;
                }
                Ok(None) => return true,
                Err(_) => {}
            }
        }
        *lock_unpoisoned(&self.is_running)
    }

    pub fn add_log(&self, level: &str, msg: &str) {
        let time = chrono_mock_time();
        let mut logs = lock_unpoisoned(&self.logs);
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
        let mut child_guard = lock_unpoisoned(&self.child);
        if let Some(child) = child_guard.as_mut() {
            if let Ok(None) = child.try_wait() {
                return;
            }
            *child_guard = None;
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

        let port = *lock_unpoisoned(&self.server_port);

        // Si el puerto ya está escuchando (instancia previa activa), vincularla sin colisionar
        if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
            self.add_log("SUCCESS", &format!("Servidor MCU Maker ya activo y respondiendo en el puerto {}.", port));
            *lock_unpoisoned(&self.is_running) = true;
            return;
        }

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
                *lock_unpoisoned(&self.is_running) = true;
                self.add_log("SUCCESS", "Servidor MCU Maker iniciado correctamente.");

                // Stream stdout
                if let Some(out) = stdout {
                    let logs = self.logs.clone();
                    std::thread::spawn(move || {
                        let reader = BufReader::new(out);
                        for line in reader.lines().map_while(Result::ok) {
                            let clean_line = strip_ansi(&line);
                            if clean_line.trim().is_empty() {
                                continue;
                            }
                            let mut l = lock_unpoisoned(&logs);
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
                        for line in reader.lines().map_while(Result::ok) {
                            let clean_line = strip_ansi(&line);
                            if clean_line.trim().is_empty() {
                                continue;
                            }
                            let mut l = lock_unpoisoned(&logs);
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
                *lock_unpoisoned(&self.is_running) = false;
                self.add_log("ERROR", &format!("No se pudo iniciar el servidor: {}", e));
            }
        }
    }

    pub fn stop_server(&self) {
        let mut child_guard = lock_unpoisoned(&self.child);
        if let Some(mut child) = child_guard.take() {
            self.add_log("WARN", "Deteniendo servidor MCU Maker...");
            let _ = child.kill();
            let _ = child.wait();
            *lock_unpoisoned(&self.is_running) = false;
            self.add_log("INFO", "Servidor detenido.");
        } else if *lock_unpoisoned(&self.is_running) {
            *lock_unpoisoned(&self.is_running) = false;
            self.add_log("WARN", "La instancia del servidor fue iniciada externamente; desconectado del monitor.");
        }
    }

    pub fn restart_server(&self) {
        self.stop_server();
        std::thread::sleep(Duration::from_millis(500));
        self.start_server();
    }
}

impl Drop for ProcessManager {
    fn drop(&mut self) {
        self.stop_server();
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
