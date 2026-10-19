use axum::{response::IntoResponse, Json};
use serde_json::json;

pub async fn handle_news_feed() -> impl IntoResponse {
    Json(json!([
        {
            "id": "mcu-maker-rust-v1",
            "title": "¡Bienvenido a MCU Maker (Rust Core + ArtCraft Launcher)!",
            "body_md": "El motor de backend ha sido completamente reconstruido en **Rust** de ultra-alto rendimiento con soporte para compilación paralela de microcontroladores y la nueva **Pasarela IoT en Red Local**.",
            "publish_date": "2026-10-17"
        }
    ]))
}
