#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod process;
mod theme;

use app::LauncherApp;

fn main() -> eframe::Result<()> {
    // Initialize background Tokio runtime for async tasks
    let rt = tokio::runtime::Runtime::new().ok();
    let _guard = rt.as_ref().map(|r| r.enter());

    let native_options = eframe::NativeOptions {
        viewport: eframe::egui::ViewportBuilder::default()
            .with_inner_size([760.0, 740.0])
            .with_min_inner_size([620.0, 560.0])
            .with_title("MCU Maker — Launcher & Hardware Studio")
            .with_active(true),
        ..Default::default()
    };

    eframe::run_native(
        "MCU Maker Launcher",
        native_options,
        Box::new(|cc| Ok(Box::new(LauncherApp::new(cc)))),
    )
}
