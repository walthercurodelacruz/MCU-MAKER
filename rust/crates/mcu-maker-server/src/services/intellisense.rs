use axum::{
    extract::Path,
    http::header,
    response::IntoResponse,
    Json,
};
use serde_json::json;

pub async fn handle_intellisense_type(Path(name): Path<String>) -> impl IntoResponse {
    // Standard library symbol definitions for popular classes
    let symbols = match name.as_str() {
        "WiFiServer" => json!([
            { "name": "begin", "kind": "method", "owner": "WiFiServer", "signature": "void begin(uint16_t port=0)" },
            { "name": "available", "kind": "method", "owner": "WiFiServer", "signature": "WiFiClient available()" },
            { "name": "close", "kind": "method", "owner": "WiFiServer", "signature": "void close()" },
            { "name": "stop", "kind": "method", "owner": "WiFiServer", "signature": "void stop()" }
        ]),
        "WiFiClient" => json!([
            { "name": "connect", "kind": "method", "owner": "WiFiClient", "signature": "int connect(IPAddress ip, uint16_t port)" },
            { "name": "connected", "kind": "method", "owner": "WiFiClient", "signature": "uint8_t connected()" },
            { "name": "write", "kind": "method", "owner": "WiFiClient", "signature": "size_t write(uint8_t b)" },
            { "name": "print", "kind": "method", "owner": "WiFiClient", "signature": "size_t print(const String &s)" },
            { "name": "println", "kind": "method", "owner": "WiFiClient", "signature": "size_t println(const String &s)" },
            { "name": "read", "kind": "method", "owner": "WiFiClient", "signature": "int read()" },
            { "name": "readStringUntil", "kind": "method", "owner": "WiFiClient", "signature": "String readStringUntil(char terminator)" },
            { "name": "stop", "kind": "method", "owner": "WiFiClient", "signature": "void stop()" }
        ]),
        "WebServer" => json!([
            { "name": "begin", "kind": "method", "owner": "WebServer", "signature": "void begin()" },
            { "name": "on", "kind": "method", "owner": "WebServer", "signature": "void on(const Uri &uri, THandlerFunction handler)" },
            { "name": "onNotFound", "kind": "method", "owner": "WebServer", "signature": "void onNotFound(THandlerFunction fn)" },
            { "name": "handleClient", "kind": "method", "owner": "WebServer", "signature": "void handleClient()" },
            { "name": "send", "kind": "method", "owner": "WebServer", "signature": "void send(int code, const char *content_type, const String &content)" },
            { "name": "hasArg", "kind": "method", "owner": "WebServer", "signature": "bool hasArg(const String &name)" },
            { "name": "arg", "kind": "method", "owner": "WebServer", "signature": "String arg(const String &name)" }
        ]),
        _ => json!([])
    };

    (
        [(header::CACHE_CONTROL, "public, max-age=86400")],
        Json(json!({
            "id": name,
            "type": name,
            "bases": [],
            "symbols": symbols
        })),
    )
}

pub async fn handle_intellisense_symbols(Path(spec): Path<String>) -> impl IntoResponse {
    (
        [(header::CACHE_CONTROL, "public, max-age=86400")],
        Json(json!({
            "id": spec,
            "symbols": []
        })),
    )
}
