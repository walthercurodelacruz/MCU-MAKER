use std::sync::Arc;
use std::path::PathBuf;
use eframe::egui::{self, Align, Button, Color32, Layout, Margin, RichText, Rounding, ScrollArea, Stroke};

use crate::process::ProcessManager;
use crate::theme::*;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LauncherWiFiConfig {
    pub ssid: String,
    pub password: String,
    pub universal_redirect: bool,
    pub virtual_ap_name: String,
    pub virtual_channel: u32,
}

impl Default for LauncherWiFiConfig {
    fn default() -> Self {
        Self {
            ssid: "TU_RED_WIFI".to_string(),
            password: "".to_string(),
            universal_redirect: true,
            virtual_ap_name: "Espressif".to_string(),
            virtual_channel: 5,
        }
    }
}

fn get_wifi_config_path() -> PathBuf {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let candidates = [
        cwd.join("wifi_config.json"),
        cwd.join("..").join("wifi_config.json"),
        cwd.join("..").join("..").join("wifi_config.json"),
    ];
    for c in candidates {
        if c.exists() {
            return c;
        }
    }
    cwd.join("wifi_config.json")
}

fn load_wifi_config() -> LauncherWiFiConfig {
    let p = get_wifi_config_path();
    if let Ok(bytes) = std::fs::read(&p) {
        if let Ok(cfg) = serde_json::from_slice::<LauncherWiFiConfig>(&bytes) {
            return cfg;
        }
    }
    let def = LauncherWiFiConfig::default();
    let _ = save_wifi_config(&def);
    def
}

fn save_wifi_config(cfg: &LauncherWiFiConfig) -> bool {
    let p = get_wifi_config_path();
    if let Ok(json) = serde_json::to_string_pretty(cfg) {
        if std::fs::write(&p, json).is_ok() {
            return true;
        }
    }
    false
}

fn bg_post_json<T: serde::Serialize + Send + 'static>(url: String, body: Option<T>) {
    std::thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
            Ok(rt) => rt,
            Err(_) => return,
        };
        rt.block_on(async move {
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(3))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new());
            let mut req = client.post(&url);
            if let Some(ref b) = body {
                req = req.json(b);
            }
            let _ = req.send().await;
        });
    });
}

pub struct LauncherApp {
    pub process_mgr: Arc<ProcessManager>,
    pub local_ip: String,
    pub server_port: u16,
    pub auto_scroll: bool,
    pub selected_tab: Tab,
    pub wifi_ssid: String,
    pub wifi_password: String,
    pub wifi_universal: bool,
    pub wifi_status_msg: Option<String>,
}

#[derive(PartialEq, Clone, Copy)]
pub enum Tab {
    Suite,
    Logs,
    Settings,
}

impl LauncherApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        // Register Google Roboto and Font Awesome Free fonts for crisp vector rendering
        let mut fonts = egui::FontDefinitions::default();
        fonts.font_data.insert(
            "roboto-regular".to_owned(),
            egui::FontData::from_static(include_bytes!("../assets/fonts/Roboto-Regular.ttf")),
        );
        fonts.font_data.insert(
            "roboto-medium".to_owned(),
            egui::FontData::from_static(include_bytes!("../assets/fonts/Roboto-Medium.ttf")),
        );
        fonts.font_data.insert(
            "roboto-bold".to_owned(),
            egui::FontData::from_static(include_bytes!("../assets/fonts/Roboto-Bold.ttf")),
        );
        fonts.font_data.insert(
            "fa-solid".to_owned(),
            egui::FontData::from_static(include_bytes!("../assets/fonts/fa-solid-900.ttf")),
        );
        fonts.font_data.insert(
            "fa-brands".to_owned(),
            egui::FontData::from_static(include_bytes!("../assets/fonts/fa-brands-400.ttf")),
        );

        // Put roboto-regular & roboto-medium as primary, then fa-solid & fa-brands for fallback icons:
        let prop = fonts.families.entry(egui::FontFamily::Proportional).or_default();
        prop.insert(0, "roboto-regular".to_owned());
        prop.insert(1, "roboto-medium".to_owned());
        prop.push("fa-solid".to_owned());
        prop.push("fa-brands".to_owned());

        let mono = fonts.families.entry(egui::FontFamily::Monospace).or_default();
        mono.push("fa-solid".to_owned());
        mono.push("fa-brands".to_owned());

        // Dedicated icons font family
        fonts.families.insert(
            egui::FontFamily::Name("icons".into()),
            vec!["fa-solid".to_owned(), "fa-brands".to_owned()],
        );

        cc.egui_ctx.set_fonts(fonts);

        let port = 8001;
        let mgr = Arc::new(ProcessManager::new(port));
        
        let local_ip = local_ip_address::local_ip()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|_| "127.0.0.1".to_string());

        let wifi_cfg = load_wifi_config();

        mgr.add_log("INFO", "MCU Maker Launcher inicializado con tipografía Roboto.");
        mgr.add_log("INFO", &format!("IP Local detectada: {}", local_ip));
        mgr.add_log("INFO", &format!("Configuración Wi-Fi activa: SSID='{}', Universal={}", wifi_cfg.ssid, wifi_cfg.universal_redirect));

        // Auto start server
        mgr.start_server();

        Self {
            process_mgr: mgr,
            local_ip,
            server_port: port,
            auto_scroll: true,
            selected_tab: Tab::Suite,
            wifi_ssid: wifi_cfg.ssid,
            wifi_password: wifi_cfg.password,
            wifi_universal: wifi_cfg.universal_redirect,
            wifi_status_msg: None,
        }
    }

    pub fn save_wifi_settings(&mut self) {
        let cfg = LauncherWiFiConfig {
            ssid: self.wifi_ssid.trim().to_string(),
            password: self.wifi_password.clone(),
            universal_redirect: self.wifi_universal,
            virtual_ap_name: "Espressif".to_string(),
            virtual_channel: 5,
        };
        save_wifi_config(&cfg);

        // Post to running server asynchronously without blocking GUI
        let port = self.server_port;
        let cfg_clone = cfg.clone();
        bg_post_json(format!("http://localhost:{}/api/config/wifi", port), Some(cfg_clone));
        bg_post_json::<()>(format!("http://localhost:{}/api/cache/clear", port), None);

        self.clear_artifacts_cache();

        self.wifi_status_msg = Some(format!("{}  Wi-Fi '{}' guardada y aplicada", ICON_CHECK, self.wifi_ssid));
        self.process_mgr.add_log("SUCCESS", &format!("Configuración Wi-Fi guardada: SSID='{}', Universal={}", self.wifi_ssid, self.wifi_universal));
        self.process_mgr.add_log("INFO", "Caché de compilación purgada para aplicar la nueva configuración Wi-Fi.");
    }

    pub fn clear_artifacts_cache(&self) {
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let dirs = [
            cwd.join("backend").join("artifacts"),
            cwd.join("artifacts"),
            cwd.join("..").join("backend").join("artifacts"),
            cwd.join("..").join("..").join("backend").join("artifacts"),
        ];
        for d in dirs {
            if d.is_dir() {
                if let Ok(entries) = std::fs::read_dir(&d) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.extension().and_then(|s| s.to_str()) == Some("json") {
                            let _ = std::fs::remove_file(p);
                        }
                    }
                }
            }
        }
    }
}

fn render_tab_button(ui: &mut egui::Ui, is_selected: bool, icon: &str, label: &str) -> bool {
    let padding = egui::vec2(16.0, 7.5);
    let (icon_color, label_color) = if is_selected {
        (COLOR_CYAN_LIGHT, COLOR_TEXT_PRIMARY)
    } else {
        (COLOR_TEXT_MUTED, COLOR_TEXT_MUTED)
    };

    let icon_font = egui::FontId::new(13.5, egui::FontFamily::Name("icons".into()));
    let label_font = egui::FontId::proportional(12.5);

    let icon_galley = ui.painter().layout_no_wrap(icon.to_string(), icon_font, icon_color);
    let label_galley = ui.painter().layout_no_wrap(label.to_string(), label_font, label_color);

    let gap = 8.0;
    let content_size = egui::vec2(
        icon_galley.size().x + gap + label_galley.size().x,
        icon_galley.size().y.max(label_galley.size().y),
    );
    let total_size = content_size + padding * 2.0;

    let (raw_rect, response) = ui.allocate_exact_size(total_size, egui::Sense::click());
    let rect = egui::Rect::from_min_size(
        egui::pos2(raw_rect.min.x.round(), raw_rect.min.y.round()),
        egui::vec2(total_size.x.round(), total_size.y.round()),
    );

    let (bg, stroke) = if is_selected {
        (
            Color32::from_rgb(28, 38, 60),
            Stroke::new(1.0_f32, Color32::from_rgb(45, 62, 92)),
        )
    } else if response.hovered() {
        (
            Color32::from_rgb(20, 28, 44),
            Stroke::new(1.0_f32, Color32::from_rgb(34, 46, 70)),
        )
    } else {
        (Color32::TRANSPARENT, Stroke::NONE)
    };

    if bg != Color32::TRANSPARENT || stroke != Stroke::NONE {
        ui.painter().rect(rect, Rounding::same(7.0), bg, stroke);
    }

    let icon_size = icon_galley.size();
    let label_size = label_galley.size();

    let icon_pos = egui::pos2(
        rect.min.x + padding.x,
        (rect.center().y - icon_size.y / 2.0).round(),
    );
    ui.painter().galley(icon_pos, icon_galley, icon_color);

    let label_pos = egui::pos2(
        (rect.min.x + padding.x + icon_size.x + gap).round(),
        (rect.center().y - label_size.y / 2.0).round(),
    );
    ui.painter().galley(label_pos, label_galley, label_color);

    response.clicked()
}

impl eframe::App for LauncherApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        apply_theme(ctx);

        // ── Top Navigation Bar ───────────────────────────────────────────────
        egui::TopBottomPanel::top("top_header")
            .frame(egui::Frame {
                inner_margin: egui::Margin::symmetric(24.0_f32, 14.0_f32),
                fill: COLOR_BG,
                stroke: Stroke::new(1.0_f32, COLOR_CARD_BORDER),
                ..Default::default()
            })
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    // Logo Icon (frameless vector glyph)
                    render_icon_badge(ui, ICON_BOLT, COLOR_CYAN_LIGHT);

                    ui.add_space(10.0);

                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new("MCU MAKER")
                                .color(COLOR_TEXT_PRIMARY)
                                .size(17.5)
                                .strong(),
                        );
                        ui.label(
                            RichText::new("Suite de Simulación Electrónica & Launcher Nativo")
                                .color(COLOR_TEXT_MUTED)
                                .size(11.5),
                        );
                    });

                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        let is_running = *self.process_mgr.is_running.lock().unwrap();
                        if is_running {
                            render_pill(
                                ui,
                                "● ONLINE",
                                COLOR_GREEN,
                                Color32::from_rgba_unmultiplied(16, 185, 129, 32),
                                Some(Color32::from_rgba_unmultiplied(16, 185, 129, 100)),
                            );
                        } else {
                            render_pill(
                                ui,
                                "● DETENIDO",
                                COLOR_RED,
                                Color32::from_rgba_unmultiplied(239, 68, 68, 32),
                                Some(Color32::from_rgba_unmultiplied(239, 68, 68, 100)),
                            );
                        }

                        render_chip(ui, &format!("Puerto: {}", self.server_port), COLOR_CYAN);
                        render_chip(ui, &format!("LAN: {}", self.local_ip), COLOR_TEXT_MUTED);
                    });
                });
            });

        // ── Bottom status & quick log toggler ────────────────────────────────
        egui::TopBottomPanel::bottom("bottom_bar")
            .frame(egui::Frame {
                inner_margin: egui::Margin::symmetric(24.0_f32, 10.0_f32),
                fill: COLOR_BG,
                stroke: Stroke::new(1.0_f32, COLOR_CARD_BORDER),
                ..Default::default()
            })
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.label(
                        RichText::new("MCU Maker v1.0.0 (Rust Core + eframe/egui)")
                            .color(COLOR_TEXT_DIM)
                            .size(11.5),
                    );

                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        if ui.add(Button::new(RichText::new(format!("{}  Consola de Eventos", ICON_TERMINAL)).size(11.5))).clicked() {
                            self.selected_tab = Tab::Logs;
                        }

                        if ui.add(Button::new(RichText::new(format!("{}  Documentación", ICON_BOOK)).size(11.5))).clicked() {
                            let _ = open::that(format!("http://localhost:{}/api/docs", self.server_port));
                        }
                    });
                });
            });

        // ── Central Panel ────────────────────────────────────────────────────
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.add_space(8.0);

            // Modern Segmented Tabs Bar
            egui::Frame {
                inner_margin: Margin::symmetric(4.0, 4.0),
                rounding: Rounding::same(9.0),
                fill: Color32::from_rgb(12, 17, 28),
                stroke: Stroke::new(1.0_f32, Color32::from_rgb(26, 36, 54)),
                ..Default::default()
            }
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    if render_tab_button(ui, self.selected_tab == Tab::Suite, ICON_BOXES, "Aplicaciones y Módulos") {
                        self.selected_tab = Tab::Suite;
                    }
                    if render_tab_button(ui, self.selected_tab == Tab::Logs, ICON_TERMINAL, "Consola de Eventos") {
                        self.selected_tab = Tab::Logs;
                    }
                    if render_tab_button(ui, self.selected_tab == Tab::Settings, ICON_GEAR, "Configuración") {
                        self.selected_tab = Tab::Settings;
                    }
                });
            });

            ui.add_space(10.0);

            match self.selected_tab {
                Tab::Suite => {
                    ScrollArea::vertical()
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            self.render_cards(ui);
                        });
                }
                Tab::Logs => {
                    self.render_logs_view(ui);
                }
                Tab::Settings => {
                    self.render_settings(ui);
                }
            }
        });

        // Request repaint for smooth state updates
        ctx.request_repaint_after(std::time::Duration::from_millis(500));
    }
}

impl LauncherApp {
    fn render_cards(&mut self, ui: &mut egui::Ui) {
        let is_running = *self.process_mgr.is_running.lock().unwrap();

        // ── Card 1: MCU Maker Studio ─────────────────────────────────────────
        card_frame().show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                render_icon_badge(ui, ICON_ROCKET, COLOR_CYAN);
                ui.add_space(14.0);
                ui.vertical(|ui| {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new("MCU Maker Studio").size(16.0).strong().color(COLOR_TEXT_PRIMARY));
                        render_pill(
                            ui,
                            "LISTO",
                            COLOR_CYAN,
                            Color32::from_rgba_unmultiplied(6, 182, 212, 32),
                            Some(Color32::from_rgba_unmultiplied(6, 182, 212, 100)),
                        );
                    });
                    ui.add_space(3.0);
                    ui.label(
                        RichText::new("Simulador interactivo en tiempo real con soporte AVR8 (Arduino), ESP32, RP2040, STM32 y motor analógico SPICE (ngspice-WASM).")
                            .size(12.5)
                            .color(COLOR_TEXT_MUTED),
                    );
                });
            });

            ui.add_space(12.0);
            ui.horizontal(|ui| {
                if ui.add(Button::new(RichText::new(format!("{}  Abrir Simulador en Navegador", ICON_PLAY)).color(Color32::from_rgb(11, 15, 25)).size(12.0).strong()).fill(COLOR_CYAN)).clicked() {
                    let _ = open::that(format!("http://localhost:{}", self.server_port));
                }
            });
        });

        ui.add_space(10.0);

        // ── Card 2: MCU Maker Rust Core Engine ────────────────────────────────
        card_frame().show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                render_icon_badge(ui, ICON_RUST, COLOR_GREEN);
                ui.add_space(14.0);
                ui.vertical(|ui| {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new("Motor de Backend (Rust Core)").size(16.0).strong().color(COLOR_TEXT_PRIMARY));
                        if is_running {
                            render_pill(
                                ui,
                                "ACTIVO",
                                COLOR_GREEN,
                                Color32::from_rgba_unmultiplied(16, 185, 129, 32),
                                Some(Color32::from_rgba_unmultiplied(16, 185, 129, 100)),
                            );
                        } else {
                            render_pill(
                                ui,
                                "INACTIVO",
                                COLOR_RED,
                                Color32::from_rgba_unmultiplied(239, 68, 68, 32),
                                Some(Color32::from_rgba_unmultiplied(239, 68, 68, 100)),
                            );
                        }
                    });
                    ui.add_space(3.0);
                    ui.label(
                        RichText::new("Servidor asíncrono nativo en Rust con Axum y Tokio. Compila sketches multi-archivo, gestiona la caché SHA-256 y provee WebSockets de telemetría.")
                            .size(12.5)
                            .color(COLOR_TEXT_MUTED),
                    );
                });
            });

            ui.add_space(12.0);
            ui.horizontal(|ui| {
                if is_running {
                    if ui.add(Button::new(RichText::new(format!("{}  Detener Servidor", ICON_POWER)).size(12.0))).clicked() {
                        self.process_mgr.stop_server();
                    }
                    if ui.add(Button::new(RichText::new(format!("{}  Reiniciar", ICON_RESTART)).size(12.0))).clicked() {
                        self.process_mgr.restart_server();
                    }
                } else {
                    if ui.add(Button::new(RichText::new(format!("{}  Iniciar Servidor", ICON_PLAY)).color(Color32::from_rgb(11, 15, 25)).size(12.0).strong()).fill(COLOR_GREEN)).clicked() {
                        self.process_mgr.start_server();
                    }
                }

                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    render_chip(ui, &format!("Endpoint: http://localhost:{}/health", self.server_port), COLOR_TEXT_MUTED);
                });
            });
        });

        ui.add_space(10.0);

        // ── Card 3: LAN IoT Gateway ──────────────────────────────────────────
        card_frame().show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                render_icon_badge(ui, ICON_GLOBE, COLOR_BLUE);
                ui.add_space(14.0);
                ui.vertical(|ui| {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new("Pasarela IoT en Red Local (LAN Gateway)").size(16.0).strong().color(COLOR_TEXT_PRIMARY));
                        render_pill(
                            ui,
                            "ZERO-CONFIG",
                            COLOR_CYAN_LIGHT,
                            Color32::from_rgba_unmultiplied(34, 211, 238, 28),
                            Some(Color32::from_rgba_unmultiplied(34, 211, 238, 90)),
                        );
                    });
                    ui.add_space(3.0);
                    ui.label(
                        RichText::new("Mapea y expone automáticamente los servidores web (WebServer, WiFiServer) de tu ESP32 o Pico a cualquier dispositivo de tu red WiFi.")
                            .size(12.5)
                            .color(COLOR_TEXT_MUTED),
                    );
                });
            });

            ui.add_space(12.0);
            let iot_url = format!("http://{}:{}/iot/", self.local_ip, self.server_port);
            ui.horizontal(|ui| {
                if ui.add(Button::new(RichText::new(format!("{}  Abrir Portal IoT", ICON_MOBILE)).size(12.0))).clicked() {
                    let _ = open::that(&iot_url);
                }

                if ui.add(Button::new(RichText::new(format!("{}  Copiar URL para Celular", ICON_COPY)).size(12.0))).clicked() {
                    ui.output_mut(|o| o.copied_text = iot_url.clone());
                    self.process_mgr.add_log("INFO", &format!("URL copiada al portapapeles: {}", iot_url));
                }

                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    render_chip(ui, &iot_url, COLOR_CYAN);
                });
            });
        });

    }

    fn render_logs_view(&mut self, ui: &mut egui::Ui) {
        card_frame().show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                ui.label(RichText::new(format!("{}  Consola de Eventos y Registros en Tiempo Real", ICON_TERMINAL)).strong().color(COLOR_TEXT_PRIMARY).size(15.5));
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.checkbox(&mut self.auto_scroll, "Auto-scroll");
                    if ui.add(Button::new(RichText::new(format!("{}  Copiar Todo", ICON_COPY)).size(11.5))).clicked() {
                        let logs = self.process_mgr.logs.lock().unwrap();
                        let text = logs.iter().map(|l| format!("[{}] [{}] {}", l.timestamp, l.level, l.message)).collect::<Vec<_>>().join("\n");
                        ui.output_mut(|o| o.copied_text = text);
                    }
                    if ui.add(Button::new(RichText::new(format!("{}  Borrar Registros", ICON_TRASH)).size(11.5))).clicked() {
                        self.process_mgr.logs.lock().unwrap().clear();
                    }
                });
            });

            ui.add_space(8.0);

            ScrollArea::vertical()
                .auto_shrink([false, false])
                .stick_to_bottom(self.auto_scroll)
                .show(ui, |ui| {
                    let logs = self.process_mgr.logs.lock().unwrap().clone();
                    for entry in logs {
                        ui.horizontal(|ui| {
                            ui.label(RichText::new(format!("[{}]", entry.timestamp)).color(COLOR_TEXT_MUTED).monospace().size(11.0));
                            
                            let level_color = match entry.level.as_str() {
                                "SUCCESS" => COLOR_GREEN,
                                "ERROR" | "STDERR" => COLOR_RED,
                                "WARN" => COLOR_AMBER,
                                "SERVER" => COLOR_CYAN,
                                _ => COLOR_TEXT_PRIMARY,
                            };
                            ui.label(RichText::new(format!("[{}]", entry.level)).color(level_color).monospace().size(11.0).strong());
                            ui.label(RichText::new(entry.message).color(COLOR_TEXT_PRIMARY).monospace().size(11.0));
                        });
                    }
                });
        });
    }

    fn render_settings(&mut self, ui: &mut egui::Ui) {
        ScrollArea::vertical()
            .auto_shrink([false, false])
            .show(ui, |ui| {
                card_frame().show(ui, |ui| {
                    ui.set_width(ui.available_width());
                    ui.horizontal(|ui| {
                        render_icon_badge(ui, ICON_GEAR, COLOR_CYAN);
                        ui.add_space(14.0);
                        ui.vertical(|ui| {
                            ui.label(RichText::new("Configuración del Sistema y Servidor").size(16.0).strong().color(COLOR_TEXT_PRIMARY));
                            ui.label(RichText::new("Gestiona el puerto de escucha y la conectividad de la red local").size(12.5).color(COLOR_TEXT_MUTED));
                        });
                    });

                    ui.add_space(12.0);

                    ui.horizontal(|ui| {
                        ui.label(RichText::new("Puerto del Servidor:").color(COLOR_TEXT_MUTED).size(12.5));
                        ui.add(egui::DragValue::new(&mut self.server_port).range(1024..=65535));

                        ui.add_space(16.0);
                        ui.label(RichText::new("IP de Red Local:").color(COLOR_TEXT_MUTED).size(12.5));
                        render_chip(ui, &self.local_ip, COLOR_CYAN);
                    });

                    ui.add_space(12.0);
                    if ui.add(Button::new(RichText::new(format!("{}  Guardar y Reiniciar Servidor", ICON_SAVE)).color(Color32::from_rgb(11, 15, 25)).size(12.0).strong()).fill(COLOR_CYAN)).clicked() {
                        self.process_mgr.set_port(self.server_port);
                        self.process_mgr.restart_server();
                    }
                });

                ui.add_space(10.0);

                card_frame().show(ui, |ui| {
                    ui.set_width(ui.available_width());
                ui.horizontal(|ui| {
                    render_icon_badge(ui, ICON_WIFI, COLOR_GREEN);
                    ui.add_space(14.0);
                    ui.vertical(|ui| {
                        ui.horizontal(|ui| {
                            ui.label(RichText::new("Configuración de Red Wi-Fi Simulada").size(16.0).strong().color(COLOR_TEXT_PRIMARY));
                            if self.wifi_universal {
                                render_pill(
                                    ui,
                                    "AUTO-CONEXIÓN UNIVERSAL",
                                    COLOR_GREEN,
                                    Color32::from_rgba_unmultiplied(16, 185, 129, 32),
                                    Some(Color32::from_rgba_unmultiplied(16, 185, 129, 100)),
                                );
                            } else {
                                render_pill(
                                    ui,
                                    "FILTRO SSID EXACTO",
                                    COLOR_CYAN_LIGHT,
                                    Color32::from_rgba_unmultiplied(34, 211, 238, 28),
                                    Some(Color32::from_rgba_unmultiplied(34, 211, 238, 90)),
                                );
                            }
                        });
                        ui.add_space(2.0);
                        ui.label(
                            RichText::new("Define el SSID y contraseña con los que trabajará tu ESP32 o Pico W en el simulador.")
                                .size(12.0)
                                .color(COLOR_TEXT_MUTED),
                        );
                    });
                });

                ui.add_space(12.0);

                ui.horizontal(|ui| {
                    ui.label(RichText::new("SSID Wi-Fi:").color(COLOR_TEXT_MUTED).size(12.5));
                    ui.add(egui::TextEdit::singleline(&mut self.wifi_ssid).desired_width(180.0));

                    ui.add_space(12.0);
                    ui.label(RichText::new("Contraseña:").color(COLOR_TEXT_MUTED).size(12.5));
                    ui.add(egui::TextEdit::singleline(&mut self.wifi_password).password(true).desired_width(150.0));
                });

                ui.add_space(10.0);
                ui.checkbox(&mut self.wifi_universal, "Modo Universal: Conectar automáticamente cualquier SSID al AP Virtual QEMU ('Espressif')");

                ui.add_space(12.0);
                ui.horizontal(|ui| {
                    if ui.add(Button::new(RichText::new(format!("{}  Guardar Configuración Wi-Fi", ICON_SAVE)).size(12.0))).clicked() {
                        self.save_wifi_settings();
                    }
                    if ui.add(Button::new(RichText::new(format!("{}  Purgar Caché de Compilación", ICON_TRASH)).size(12.0))).clicked() {
                        self.clear_artifacts_cache();
                        let port = self.server_port;
                        bg_post_json::<()>(format!("http://localhost:{}/api/cache/clear", port), None);
                        self.wifi_status_msg = Some(format!("{}  Caché purgada correctamente", ICON_CHECK));
                        self.process_mgr.add_log("INFO", "Caché de compilación purgada manualmente.");
                    }
                    if let Some(ref msg) = self.wifi_status_msg {
                        ui.label(RichText::new(msg).color(COLOR_GREEN).size(12.0).strong());
                    }
                });

                ui.add_space(8.0);
                ui.horizontal(|ui| {
                    ui.label(RichText::new(ICON_LIGHTBULB).color(COLOR_AMBER).size(12.0));
                    ui.label(
                        RichText::new("En Modo Universal puedes dejar en tu código cualquier SSID ('TU_RED_WIFI', tu red de casa, etc.) y se conectará automáticamente sin tener que cambiar el código C++.")
                            .size(11.0)
                            .color(COLOR_TEXT_DIM),
                    );
                });
            });
        });
    }
}
