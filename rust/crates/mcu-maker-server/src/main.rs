use std::net::SocketAddr;
use std::sync::Arc;
use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, Method, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{delete, get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

mod config;
mod services;

use config::ServerConfig;
use services::{
    arduino_cli::ArduinoCLIService,
    compile::{
        handle_cache_clear, handle_compile_start, handle_compile_status, handle_compile_sync,
        CompileService,
    },
    compile_chip::{handle_compile_chip, handle_compile_chip_status, ChipCompileService},
    compile_rom::handle_compile_rom,
    flash::handle_flash_upload,
    intellisense::{handle_intellisense_symbols, handle_intellisense_type},
    iot_gateway::{
        handle_gateway_proxy_path, handle_gateway_proxy_root, handle_iot_portal, IoTGatewayService,
    },
    libraries::{
        handle_library_install, handle_library_list, handle_library_search,
        handle_library_uninstall,
    },
    micropython_libs::{handle_mpy_fetch, handle_mpy_search, MicroPythonLibsService},
    news::handle_news_feed,
    simulation_ws::{handle_simulation_ws, SimulationWsManager},
    wifi_config::{handle_get_wifi_config, handle_update_wifi_config, WiFiConfigService},
};

#[derive(Clone)]
pub struct AppState {
    pub config: ServerConfig,
    pub arduino_cli: Arc<ArduinoCLIService>,
    pub compile: Arc<CompileService>,
    pub compile_chip: Arc<ChipCompileService>,
    pub gateway: Arc<IoTGatewayService>,
    pub mpy_libs: Arc<MicroPythonLibsService>,
    pub simulation_ws: Arc<SimulationWsManager>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber).ok();

    let config = ServerConfig::from_args_and_env();
    info!("Starting MCU Maker Rust Engine v1.0.0");
    info!("Frontend static path: {:?}", config.frontend_dist);
    info!("Artifact cache path: {:?}", config.artifact_cache_dir);

    let arduino_cli = Arc::new(ArduinoCLIService::new(config.arduino_cli_path.clone()));
    let compile = Arc::new(CompileService::new(
        arduino_cli.clone(),
        config.artifact_cache_dir.clone(),
    ));
    let compile_chip = Arc::new(ChipCompileService::new());
    let gateway = Arc::new(IoTGatewayService::new());
    let mpy_libs = Arc::new(MicroPythonLibsService::new());
    let simulation_ws = Arc::new(SimulationWsManager::new(gateway.clone()));
    let wifi_config = Arc::new(WiFiConfigService::new());

    let state = AppState {
        config: config.clone(),
        arduino_cli: arduino_cli.clone(),
        compile: compile.clone(),
        compile_chip: compile_chip.clone(),
        gateway: gateway.clone(),
        mpy_libs: mpy_libs.clone(),
        simulation_ws: simulation_ws.clone(),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::PATCH,
            Method::OPTIONS,
        ])
        .allow_headers(Any);

    let api_router = Router::new()
        // Health
        .route("/health", get(health_check))
        .route("/health/libcache", get(health_libcache))
        // Compile
        .route("/api/compile", post(handle_compile_sync).with_state(compile.clone()))
        .route("/compile", post(handle_compile_sync).with_state(compile.clone()))
        .route("/api/compile/start", post(handle_compile_start).with_state(compile.clone()))
        .route("/compile/start", post(handle_compile_start).with_state(compile.clone()))
        .route("/api/compile/status/:job_id", get(handle_compile_status).with_state(compile.clone()))
        .route("/compile/status/:job_id", get(handle_compile_status).with_state(compile.clone()))
        .route("/api/cache/clear", post(handle_cache_clear).with_state(compile.clone()))
        .route("/cache/clear", post(handle_cache_clear).with_state(compile.clone()))
        // WiFi Configuration
        .route("/api/config/wifi", get(handle_get_wifi_config).post(handle_update_wifi_config).with_state(wifi_config.clone()))
        // Custom Chips
        .route("/api/compile-chip", post(handle_compile_chip).with_state(compile_chip.clone()))
        .route("/api/compile-chip/status", get(handle_compile_chip_status).with_state(compile_chip.clone()))
        // ROM Compile
        .route("/api/compile-rom", post(handle_compile_rom))
        // Libraries
        .route("/api/libraries/search", get(handle_library_search).with_state(arduino_cli.clone()))
        .route("/api/libraries/install", post(handle_library_install).with_state(arduino_cli.clone()))
        .route("/api/libraries/uninstall", delete(handle_library_uninstall).with_state(arduino_cli.clone()))
        .route("/api/libraries/list", get(handle_library_list).with_state(arduino_cli.clone()))
        // MicroPython Libs
        .route("/api/micropython-libs/search", get(handle_mpy_search).with_state(mpy_libs.clone()))
        .route("/api/micropython-libs/fetch", post(handle_mpy_fetch).with_state(mpy_libs.clone()))
        // Intellisense
        .route("/api/intellisense/type/:name", get(handle_intellisense_type))
        .route("/api/intellisense/symbols/:spec", get(handle_intellisense_symbols))
        // News
        .route("/api/news/feed", get(handle_news_feed))
        // Hardware Flash
        .route("/api/flash/upload", post(handle_flash_upload).with_state(arduino_cli.clone()))
        // Simulation WebSocket
        .route("/api/simulation/ws/:client_id", get(handle_simulation_ws).with_state(simulation_ws.clone()))
        .route("/simulation/ws/:client_id", get(handle_simulation_ws).with_state(simulation_ws.clone()))
        // IoT Gateway reverse proxy
        .route("/api/gateway/:client_id", get(handle_gateway_proxy_root).post(handle_gateway_proxy_root).with_state(gateway.clone()))
        .route("/api/gateway/:client_id/", get(handle_gateway_proxy_root).post(handle_gateway_proxy_root).with_state(gateway.clone()))
        .route("/api/gateway/:client_id/*path", get(handle_gateway_proxy_path).post(handle_gateway_proxy_path).with_state(gateway.clone()))
        // IoT Portal
        .route("/iot", get(handle_iot_portal).with_state(gateway.clone()))
        .route("/iot/", get(handle_iot_portal).with_state(gateway.clone()))
        .route("/iot/*path", get(handle_iot_portal).with_state(gateway.clone()));

    // Static assets router
    let assets_dir = config.frontend_dist.join("assets");
    let app = if assets_dir.is_dir() {
        info!("Serving static assets from {:?}", assets_dir);
        api_router
            .nest_service("/assets", ServeDir::new(assets_dir))
            .fallback(handle_spa_fallback)
            .with_state(state)
            .layer(cors)
    } else {
        api_router
            .fallback(handle_spa_fallback)
            .with_state(state)
            .layer(cors)
    };

    let bind_addr: SocketAddr = format!("{}:{}", config.host, config.port).parse()?;
    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    println!("\x1b[36m=====================================================\x1b[0m");
    println!("\x1b[1;36m       MCU MAKER RUST ENGINE & SIMULATOR CORE\x1b[0m");
    println!("\x1b[36m=====================================================\x1b[0m");
    println!("  -> Servidor Local:    \x1b[32mhttp://localhost:{}\x1b[0m", config.port);
    println!("  -> Pasarela IoT LAN:  \x1b[33mhttp://{}:{}/iot/\x1b[0m", local_ip, config.port);
    println!("  -> API Endpoints:     \x1b[34mhttp://localhost:{}/api/compile\x1b[0m", config.port);
    println!("\x1b[36m=====================================================\x1b[0m\n");

    let listener = tokio::net::TcpListener::bind(bind_addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> impl IntoResponse {
    axum::Json(serde_json::json!({
        "status": "healthy",
        "engine": "rust",
        "version": "1.0.0"
    }))
}

async fn health_libcache() -> impl IntoResponse {
    axum::Json(serde_json::json!({
        "status": "healthy",
        "overlay": "oss-rust"
    }))
}

async fn handle_spa_fallback(
    State(state): State<AppState>,
    req: Request,
) -> Response {
    let path = req.uri().path().trim_start_matches('/');
    let target = state.config.frontend_dist.join(path);

    if !path.is_empty() && target.is_file() {
        if let Ok(content) = tokio::fs::read(&target).await {
            let mime = mime_guess::from_path(&target).first_or_octet_stream().to_string();
            return Response::builder()
                .header(header::CONTENT_TYPE, mime)
                .body(Body::from(content))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    }

    let index_file = state.config.frontend_dist.join("index.html");
    if index_file.is_file() {
        if let Ok(html) = tokio::fs::read_to_string(&index_file).await {
            return Html(html).into_response();
        }
    }

    Html(format!(
        r#"<!doctype html><html><head><title>MCU Maker Rust Core</title>
        <style>body{{background:#0b0f19;color:#e2e8f0;font-family:sans-serif;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}}.box{{max-width:500px;padding:30px;background:#1e293b;border-radius:12px}}h1{{color:#22d3ee}}</style></head>
        <body><div class="box">
            <h1>MCU Maker Rust Engine</h1>
            <p>Servidor activo en el puerto <code>{}</code>.</p>
            <p>Para abrir el simulador, compila el frontend o abre el launcher.</p>
        </div></body></html>"#,
        state.config.port
    )).into_response()
}
