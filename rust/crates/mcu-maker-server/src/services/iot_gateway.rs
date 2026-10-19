use std::collections::HashMap;
use std::sync::Arc;
use axum::{
    body::Body,
    extract::{Path, Request, State},
    http::{header, StatusCode},
    response::{Html, IntoResponse, Response},
};
use tokio::sync::RwLock;

const GATEWAY_SHIM: &str = r#"<script>(function(){
var P="%PREFIX%";
if(window.__mcuMakerGatewayShim)return;window.__mcuMakerGatewayShim=P;
var BOARD=/^(192\.168\.4\.\d{1,3}|10\.13\.37\.\d{1,3})$/;
function rw(u){
  try{
    if(u==null)return u;
    var s=String(u);
    if(!s)return u;
    if(s.slice(0,2)==='//'||/^[a-z][a-z0-9+.-]*:/i.test(s)){
      try{
        var a=new URL(s,location.href);
        if((a.protocol==='http:'||a.protocol==='https:')&&BOARD.test(a.hostname))
          return P+a.pathname.replace(/^\//,'')+a.search+a.hash;
      }catch(e){}
      return u;
    }
    if(s.charAt(0)!=='/')return u;
    if(s.indexOf(P)===0)return u;
    return P+s.slice(1);
  }catch(e){return u;}
}
window.__mcuMakerGatewayRewrite=rw;
var of=window.fetch;
if(of)window.fetch=function(i,o){
  try{
    if(typeof i==='string'||i instanceof URL)i=rw(String(i));
    else if(typeof Request!=='undefined'&&i instanceof Request){
      var n=rw(i.url);if(n!==i.url)i=new Request(n,i);
    }
  }catch(e){}
  return of.call(this,i,o);
};
var ox=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){
  var a=Array.prototype.slice.call(arguments);
  try{a[1]=rw(u);}catch(e){}
  return ox.apply(this,a);
};
function fix(el){
  ['src','href','action'].forEach(function(at){
    if(!el.getAttribute)return;
    var v=el.getAttribute(at);
    if(v==null||v==='')return;
    if(v.charAt(0)==='#')return;
    var n=rw(v);
    if(n!==v)el.setAttribute(at,n);
  });
}
function sweep(root){
  try{
    if(root.querySelectorAll)
      Array.prototype.forEach.call(root.querySelectorAll('[src],[href],[action]'),fix);
    if(root.nodeType===1)fix(root);
  }catch(e){}
}
if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',function(){sweep(document);});
else sweep(document);
try{
  new MutationObserver(function(ms){
    ms.forEach(function(m){
      Array.prototype.forEach.call(m.addedNodes,function(n){if(n.nodeType===1)sweep(n);});
      if(m.type==='attributes'&&m.target)fix(m.target);
    });
  }).observe(document.documentElement,{childList:true,subtree:true,
    attributes:true,attributeFilter:['src','href','action']});
}catch(e){}
})();</script>"#;

#[derive(Debug, Clone)]
pub struct BoardInstance {
    pub client_id: String,
    pub hostfwd_port: u16,
    pub ip: String,
    pub description: String,
    pub last_seen: u64,
}

#[derive(Clone)]
pub struct IoTGatewayService {
    client: reqwest::Client,
    pub instances: Arc<RwLock<HashMap<String, BoardInstance>>>,
}

impl IoTGatewayService {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
            instances: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register(&self, client_id: String, port: u16, ip: String, desc: String) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let mut map = self.instances.write().await;
        map.insert(
            client_id.clone(),
            BoardInstance {
                client_id,
                hostfwd_port: port,
                ip,
                description: desc,
                last_seen: now,
            },
        );
    }

    pub async fn unregister(&self, client_id: &str) {
        let mut map = self.instances.write().await;
        map.remove(client_id);
    }

    pub async fn get_instance(&self, client_id: &str) -> Option<BoardInstance> {
        let map = self.instances.read().await;
        map.get(client_id).cloned()
    }

    pub async fn get_active_instances(&self) -> Vec<BoardInstance> {
        let map = self.instances.read().await;
        map.values().cloned().collect()
    }
}

// ── Handlers ────────────────────────────────────────────────────────────────

pub async fn handle_iot_portal(
    State(gateway): State<Arc<IoTGatewayService>>,
) -> impl IntoResponse {
    let instances = gateway.get_active_instances().await;
    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    let mut cards_html = String::new();
    let has_instances = !instances.is_empty();

    if !has_instances {
        cards_html.push_str(
            r#"<div class="empty-state">
                <div class="icon">📡</div>
                <h2>Buscando servidores IoT activos...</h2>
                <p>Inicia una simulación con <b>ESP32</b> o <b>Raspberry Pi Pico W</b> que levante un servidor web (<code>WebServer</code> o <code>WiFiServer</code>).</p>
                <div class="scanning-badge">
                    <span class="pulse"></span> Auto-escaneando red virtual (192.168.4.15)...
                </div>
            </div>"#,
        );
    } else {
        for inst in &instances {
            cards_html.push_str(&format!(
                r#"<div class="device-card">
                    <div class="badge">ONLINE</div>
                    <h3>{}</h3>
                    <p class="meta">IP Virtual: <code>{}</code> | Puerto Host: <code>{}</code></p>
                    <p class="desc">{}</p>
                    <a href="/api/gateway/{}/" class="btn">Abrir Panel Web del ESP32 →</a>
                </div>"#,
                inst.client_id, inst.ip, inst.hostfwd_port, inst.description, inst.client_id
            ));
        }
    }

    let refresh_tag = if !has_instances {
        r#"<meta http-equiv="refresh" content="3">"#
    } else {
        ""
    };

    let html = format!(
        r#"<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MCU Maker — Pasarela IoT LAN</title>
    {}
    <style>
        body {{
            background: #0b0f19;
            color: #f1f5f9;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 40px 20px;
            display: flex;
            justify-content: center;
        }}
        .container {{
            max-width: 800px;
            width: 100%;
        }}
        .header {{
            text-align: center;
            margin-bottom: 35px;
        }}
        h1 {{
            color: #22d3ee;
            font-size: 28px;
            margin: 0 0 10px 0;
        }}
        p.subtitle {{
            color: #94a3b8;
            font-size: 15px;
            margin: 0;
        }}
        .lan-pill {{
            display: inline-block;
            background: #1e293b;
            border: 1px solid #334155;
            padding: 8px 16px;
            border-radius: 9999px;
            font-size: 14px;
            margin-top: 15px;
            color: #38bdf8;
            font-weight: 500;
        }}
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 20px;
        }}
        .device-card {{
            background: #131b2e;
            border: 1px solid #334155;
            border-radius: 12px;
            padding: 24px;
            position: relative;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }}
        .badge {{
            position: absolute;
            top: 20px;
            right: 20px;
            background: #10b981;
            color: #fff;
            font-size: 11px;
            font-weight: bold;
            padding: 3px 8px;
            border-radius: 6px;
            letter-spacing: 0.5px;
        }}
        h3 {{
            margin: 0 0 8px 0;
            color: #fff;
            font-size: 18px;
        }}
        .meta {{
            color: #94a3b8;
            font-size: 13px;
            margin: 0 0 12px 0;
        }}
        .desc {{
            color: #cbd5e1;
            font-size: 14px;
            line-height: 1.5;
            margin: 0 0 20px 0;
        }}
        .btn {{
            display: inline-block;
            background: #0284c7;
            color: #fff;
            padding: 10px 20px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            transition: background 0.15s;
        }}
        .btn:hover {{
            background: #0369a1;
        }}
        .empty-state {{
            background: #131b2e;
            border: 1px dashed #334155;
            border-radius: 16px;
            padding: 48px;
            text-align: center;
        }}
        .empty-state .icon {{
            font-size: 40px;
            margin-bottom: 12px;
        }}
        .scanning-badge {{
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-top: 18px;
            padding: 6px 14px;
            background: #1e293b;
            border-radius: 20px;
            font-size: 13px;
            color: #38bdf8;
        }}
        .pulse {{
            width: 8px;
            height: 8px;
            background: #38bdf8;
            border-radius: 50%;
            display: inline-block;
            animation: pulse-anim 1.5s infinite;
        }}
        @keyframes pulse-anim {{
            0% {{ transform: scale(0.95); opacity: 0.5; }}
            50% {{ transform: scale(1.3); opacity: 1; }}
            100% {{ transform: scale(0.95); opacity: 0.5; }}
        }}
        code {{
            background: #1e293b;
            color: #38bdf8;
            padding: 2px 6px;
            border-radius: 4px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌐 Pasarela IoT LAN de MCU Maker</h1>
            <p class="subtitle">Conexión directa a tus microcontroladores y servidores web simulados</p>
            <div class="lan-pill">Portal LAN: http://{}:8001/iot/</div>
        </div>
        <div class="grid">
            {}
        </div>
    </div>
</body>
</html>"#,
        refresh_tag, local_ip, cards_html
    );

    Html(html)
}

pub async fn handle_gateway_proxy_root(
    State(gateway): State<Arc<IoTGatewayService>>,
    Path(client_id): Path<String>,
    req: Request,
) -> Response {
    handle_gateway_proxy_inner(gateway, client_id, String::new(), req).await
}

pub async fn handle_gateway_proxy_path(
    State(gateway): State<Arc<IoTGatewayService>>,
    Path((client_id, path)): Path<(String, String)>,
    req: Request,
) -> Response {
    handle_gateway_proxy_inner(gateway, client_id, path, req).await
}

async fn handle_gateway_proxy_inner(
    gateway: Arc<IoTGatewayService>,
    client_id: String,
    path: String,
    req: Request,
) -> Response {
    let instance = gateway.get_instance(&client_id).await;
    let target_port = if let Some(inst) = instance {
        inst.hostfwd_port
    } else {
        8080
    };

    let (parts, body) = req.into_parts();
    let query_str = parts.uri.query().map(|q| format!("?{}", q)).unwrap_or_default();
    let target_url = format!("http://127.0.0.1:{}/{}{}", target_port, path.trim_start_matches('/'), query_str);
    let method = parts.method.clone();
    let prefix = format!("/api/gateway/{}/", client_id);

    let body_bytes = axum::body::to_bytes(body, 10 * 1024 * 1024)
        .await
        .unwrap_or_default();

    // Forward request
    let mut builder = gateway.client.request(method, &target_url);
    for (k, v) in &parts.headers {
        if k != "host" && k != "content-length" {
            builder = builder.header(k, v);
        }
    }
    if !body_bytes.is_empty() {
        builder = builder.body(body_bytes);
    }

    match builder.send().await {
        Ok(resp) => {
            let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::OK);
            let content_type = resp
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();

            if content_type.contains("text/html") {
                let text = resp.text().await.unwrap_or_default();
                let shim = GATEWAY_SHIM.replace("%PREFIX%", &prefix);
                let lower = text.to_lowercase();
                let modified = if let Some(pos) = lower.find("<head") {
                    if let Some(end_tag) = text[pos..].find('>') {
                        let tag_end_idx = pos + end_tag + 1;
                        format!("{}{}{}", &text[..tag_end_idx], shim, &text[tag_end_idx..])
                    } else {
                        format!("{}{}", shim, text)
                    }
                } else if let Some(pos) = lower.find("<html") {
                    if let Some(end_tag) = text[pos..].find('>') {
                        let tag_end_idx = pos + end_tag + 1;
                        format!("{}{}{}", &text[..tag_end_idx], shim, &text[tag_end_idx..])
                    } else {
                        format!("{}{}", shim, text)
                    }
                } else {
                    format!("{}{}", shim, text)
                };

                let mut res = Html(modified).into_response();
                *res.status_mut() = status;
                res
            } else {
                let bytes = resp.bytes().await.unwrap_or_default();
                let mut res = Response::builder().status(status);
                if !content_type.is_empty() {
                    res = res.header(header::CONTENT_TYPE, content_type);
                }
                res.body(Body::from(bytes)).unwrap_or_else(|_| {
                    StatusCode::INTERNAL_SERVER_ERROR.into_response()
                })
            }
        }
        Err(_) => {
            let no_server_html = format!(
                r#"<!doctype html><html><head><meta charset="utf-8">
                <title>MCU Maker — Conectando al servidor web del ESP32...</title>
                <meta http-equiv="refresh" content="2">
                <style>body{{background:#0b0f19;color:#cbd5e1;font-family:sans-serif;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}}.box{{max-width:520px;padding:32px}}h1{{font-size:22px;color:#22d3ee}}code{{background:#1e293b;color:#38bdf8;padding:2px 6px;border-radius:4px}}</style></head>
                <body><div class="box">
                    <h1>📡 Esperando al servidor web del ESP32</h1>
                    <p>La simulación está activa. Esperando a que el ESP32 complete la conexión WiFi y abra el puerto <code>{}</code>.</p>
                    <p>Esta página se actualizará automáticamente cada 2 segundos...</p>
                </div></body></html>"#,
                target_port
            );
            (StatusCode::OK, Html(no_server_html)).into_response()
        }
    }
}

