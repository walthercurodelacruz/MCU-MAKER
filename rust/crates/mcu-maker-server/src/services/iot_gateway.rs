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
if(typeof XMLHttpRequest!=='undefined'&&XMLHttpRequest.prototype){
  var ox=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    var a=Array.prototype.slice.call(arguments);
    try{a[1]=rw(u);}catch(e){}
    return ox.apply(this,a);
  };
}
function fix(el){
  ['src','href','action'].forEach(function(at){
    if(!el.getAttribute)return;
    var v=el.getAttribute(at);
    if(v==null||v==='')return;
    if(v.charAt(0)==='#')return;
    var n=rw(v);
    if(n!==v)el.setAttribute(at,n);
  });
  if(el.getAttribute){
    var oc=el.getAttribute('onclick');
    if(oc && oc.indexOf('location')!==-1){
      var noc=oc.replace(/((?:window\.)?location(?:\.href)?\s*=\s*['"])([^'"]+)(['"])/g,function(_,p1,u,p3){
        return p1+rw(u)+p3;
      });
      if(noc!==oc)el.setAttribute('onclick',noc);
    }
  }
}
function sweep(root){
  try{
    if(root.querySelectorAll)
      Array.prototype.forEach.call(root.querySelectorAll('[src],[href],[action],[onclick]'),fix);
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
    attributes:true,attributeFilter:['src','href','action','onclick']});
}catch(e){}
try{
  document.addEventListener('click',function(e){
    try{
      var t=e.target;
      if(t&&t.getAttribute){
        var oc=t.getAttribute('onclick');
        if(oc){
          var m=oc.match(/(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/);
          if(m&&m[1]){
            e.preventDefault();
            e.stopImmediatePropagation();
            window.location.href=rw(m[1]);
            return;
          }
        }
      }
      var a=t&&(t.closest?t.closest('a'):null);
      if(!a&&t){
        var p=t.parentElement;
        while(p){if(p.tagName==='A'){a=p;break;}p=p.parentElement;}
      }
      if(a&&a.getAttribute){
        var h=a.getAttribute('href');
        if(h&&h.charAt(0)!=='#'&&h.indexOf('javascript:')!==0){
          var nh=rw(h);
          if(nh&&nh!==h){a.setAttribute('href',nh);h=nh;}
          if(t.tagName==='BUTTON'||t.tagName==='INPUT'||(t.closest&&t.closest('button'))){
            e.preventDefault();
            window.location.href=h;
          }
        }
      }
    }catch(err){}
  },true);
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
    pub server_port: u16,
}

fn escape_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#x27;"),
            _ => out.push(ch),
        }
    }
    out
}

fn sanitize_client_id_segment(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.' || *c == ':')
        .collect()
}

impl IoTGatewayService {
    pub fn new() -> Self {
        Self::with_port(8001)
    }

    pub fn with_port(server_port: u16) -> Self {
        Self {
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
            instances: Arc::new(RwLock::new(HashMap::new())),
            server_port,
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
            let safe_id_html = escape_html(&inst.client_id);
            let safe_ip_html = escape_html(&inst.ip);
            let safe_desc_html = escape_html(&inst.description);
            let safe_id_url = sanitize_client_id_segment(&inst.client_id);
            cards_html.push_str(&format!(
                r#"<div class="device-card">
                    <div class="badge">ONLINE</div>
                    <h3>{}</h3>
                    <p class="meta">IP Virtual: <code>{}</code> | Puerto Host: <code>{}</code></p>
                    <p class="desc">{}</p>
                    <a href="/api/gateway/{}/" class="btn">Abrir Panel Web del ESP32 →</a>
                </div>"#,
                safe_id_html, safe_ip_html, inst.hostfwd_port, safe_desc_html, safe_id_url
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
            <div class="lan-pill">Portal LAN: http://{}:{}/iot/</div>
        </div>
        <div class="grid">
            {}
        </div>
    </div>
</body>
</html>"#,
        refresh_tag, local_ip, gateway.server_port, cards_html
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
    let target_port = match instance {
        Some(inst) => inst.hostfwd_port,
        None => {
            let safe_id = escape_html(&client_id);
            let not_found_html = format!(
                r#"<!doctype html><html><head><meta charset="utf-8"><title>MCU Maker — Dispositivo no activo</title>
                <style>body{{background:#0b0f19;color:#cbd5e1;font-family:sans-serif;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}}.box{{max-width:520px;padding:32px}}h1{{font-size:22px;color:#f87171}}code{{background:#1e293b;color:#38bdf8;padding:2px 6px;border-radius:4px}}</style></head>
                <body><div class="box">
                    <h1>Dispositivo IoT no encontrado</h1>
                    <p>No hay ninguna simulación Wi-Fi activa registrada para <code>{}</code>.</p>
                </div></body></html>"#,
                safe_id
            );
            return (StatusCode::NOT_FOUND, Html(not_found_html)).into_response();
        }
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

            let location_opt = resp
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .map(|loc| {
                    if loc.starts_with('/') {
                        format!("{}{}", prefix, loc.trim_start_matches('/'))
                    } else if loc.contains("192.168.4.") || loc.contains("10.13.37.") {
                        if let Ok(u) = reqwest::Url::parse(loc) {
                            let q = u.query().map(|s| format!("?{}", s)).unwrap_or_default();
                            format!("{}{}{}", prefix, u.path().trim_start_matches('/'), q)
                        } else {
                            format!("{}{}", prefix, loc)
                        }
                    } else if !loc.starts_with("http://") && !loc.starts_with("https://") {
                        format!("{}{}", prefix, loc)
                    } else {
                        loc.to_string()
                    }
                });

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
                if let Some(ref new_loc) = location_opt {
                    if let Ok(val) = new_loc.parse() {
                        res.headers_mut().insert(header::LOCATION, val);
                    }
                }
                res
            } else {
                let bytes = resp.bytes().await.unwrap_or_default();
                let mut res = Response::builder().status(status);
                if !content_type.is_empty() {
                    res = res.header(header::CONTENT_TYPE, content_type);
                }
                if let Some(ref new_loc) = location_opt {
                    res = res.header(header::LOCATION, new_loc);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_gateway_registration() {
        let service = IoTGatewayService::new();
        service.register(
            "board-123".to_string(),
            8081,
            "192.168.4.15".to_string(),
            "ESP32 Test".to_string(),
        ).await;

        let inst = service.get_instance("board-123").await;
        assert!(inst.is_some());
        let inst = inst.unwrap();
        assert_eq!(inst.client_id, "board-123");
        assert_eq!(inst.hostfwd_port, 8081);
        assert_eq!(inst.ip, "192.168.4.15");

        let all = service.get_active_instances().await;
        assert_eq!(all.len(), 1);

        service.unregister("board-123").await;
        assert!(service.get_instance("board-123").await.is_none());
    }

    #[test]
    fn test_gateway_shim_valid_js_structure() {
        assert!(GATEWAY_SHIM.starts_with("<script>"));
        assert!(GATEWAY_SHIM.ends_with("</script>"));
        assert!(GATEWAY_SHIM.contains("MutationObserver"));
        assert!(GATEWAY_SHIM.contains(".observe("));
        assert!(GATEWAY_SHIM.contains("window.__mcuMakerGatewayRewrite"));
        assert!(GATEWAY_SHIM.contains("addEventListener('click'"));

        // Verify balanced parentheses and braces in the JS payload
        let js = GATEWAY_SHIM
            .trim_start_matches("<script>")
            .trim_end_matches("</script>");

        let mut parens = 0i32;
        let mut braces = 0i32;
        for c in js.chars() {
            match c {
                '(' => parens += 1,
                ')' => parens -= 1,
                '{' => braces += 1,
                '}' => braces -= 1,
                _ => {}
            }
            assert!(parens >= 0, "Unmatched closing parenthesis in GATEWAY_SHIM");
            assert!(braces >= 0, "Unmatched closing brace in GATEWAY_SHIM");
        }
        assert_eq!(parens, 0, "Unbalanced parentheses in GATEWAY_SHIM");
        assert_eq!(braces, 0, "Unbalanced braces in GATEWAY_SHIM");
    }

    #[test]
    fn test_gateway_shim_prefix_replacement() {
        let prefix = "/api/gateway/test-client/";
        let replaced = GATEWAY_SHIM.replace("%PREFIX%", prefix);
        assert!(replaced.contains("var P=\"/api/gateway/test-client/\";"));
        assert!(!replaced.contains("%PREFIX%"));
    }

    #[test]
    fn test_escape_html_prevents_xss() {
        assert_eq!(
            escape_html(r#"<script>alert("x")</script>&'"#),
            "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#x27;"
        );
    }

    #[tokio::test]
    async fn test_iot_portal_preserves_colons_in_client_id() {
        let service = Arc::new(IoTGatewayService::with_port(8001));
        let cid = "43d3cc3c-4a5d-49a6-8e3f-89a2341b511c::esp32";
        service
            .register(
                cid.to_string(),
                54321,
                "192.168.4.15".to_string(),
                "ESP32 Web Server".to_string(),
            )
            .await;

        let resp = handle_iot_portal(State(service)).await.into_response();
        assert_eq!(resp.status(), StatusCode::OK);
        let body = axum::body::to_bytes(resp.into_body(), usize::MAX).await.unwrap();
        let html = String::from_utf8(body.to_vec()).unwrap();
        assert!(
            html.contains(&format!(r#"href="/api/gateway/{}/""#, cid)),
            "Portal link stripped colons from client_id: {}",
            html
        );
    }

    #[tokio::test]
    async fn test_unregistered_client_returns_404() {
        let service = Arc::new(IoTGatewayService::with_port(8001));
        let req = Request::builder().uri("/").body(Body::empty()).unwrap();
        let resp = handle_gateway_proxy_inner(service, "unknown-client".to_string(), String::new(), req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
}


