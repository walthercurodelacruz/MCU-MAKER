# MCU Maker - Reconstrucción Completa en Rust & Suite Nativa

Este proyecto ha sido completamente reconstruido en **Rust**, eliminando dependencias de runtime lentas como Python/Uvicorn para el backend de simulación y herramientas de compilación, y adoptando un **Launcher de Escritorio Nativo de alto rendimiento** similar al **ArtCraft Launcher**.

---

## 🚀 Componentes Principales

### 1. `mcu-maker-launcher` (Launcher de Escritorio Nativo)
Inspirado y modelado a partir de la ingeniería inversa de **ArtCraft Launcher**:
- **Framework UI:** Rust nativo con `eframe` / `egui` (renderizado acelerado por GPU vía OpenGL/Glow y winit).
- **Tema Visual:** *Dark Slate & Electric Cyan* (#0b0f19, #131b2e, acentos cian #06b6d4 y verdes esmeralda para estado activo).
- **Arquitectura Multitarea:** Canales MPSC / Crossbeam para streaming asíncrono de logs, sondeo reactivo de salud del backend, y supervisión de procesos en hilos dedicados sin congelar la interfaz.
- **Suite Cards:**
  - **MCU Maker Studio (Web IDE):** Estado del servidor, dirección de escucha, botón de inicio/parada, apertura en un clic en el navegador predeterminado.
  - **Rust Native Engine:** Control del motor Axum con monitor de telemetría y subprocesos.
  - **LAN IoT Gateway & Reverse Proxy:** Detección automática de la IP de red local (`192.168.x.x`), permitiendo que dispositivos físicos como ESP32, ESP8266, Raspberry Pi Pico W y micro:bit se conecten a la simulación sin configuración manual.
  - **Hardware Flasher & Toolchains:** Monitor de placas y detección de CLI (`arduino-cli`, AVR-GCC, esptool).
- **Consola de Logs en Tiempo Real:** Monitor de salida estándar y error con coloreado de advertencias/errores, auto-scroll y botón de limpieza de buffer.
- **Pestaña de Configuración:** Selección de puerto (por defecto `8001`), opciones de inicio automático y apertura inmediata del navegador.

### 2. `mcu-maker-server` (Motor de Servidor Axum en Rust)
Reconstrucción 1:1 en Rust con rendimiento ultra-rápido y bajo consumo de memoria:
- **Salud y Caché de Librerías:** `/health`, `/health/libcache`.
- **Compilación de Código:**
  - `/api/compile` (síncrona y asíncrona `/start` + `/status/:id` con workers en background).
  - Generación de sketches temporales, llamada a `arduino-cli compile --fqbn ...`, hash SHA-256 de caché para recompilaciones instantáneas.
- **Compilador de Chips Personalizados C -> WASM:** `/api/compile-chip` y `/api/compile-chip/status`.
- **Conversor y Analizador Intel HEX -> Binario:** `/api/compile-rom` compatible con simuladores 8051, AVR y PIC.
- **Gestor de Librerías:** `/api/libraries/search`, `/api/libraries/install`, `/api/libraries/uninstall`, `/api/libraries/installed`.
- **Ecosistema MicroPython:** `/api/micropython-libs/search`, `/api/micropython-libs/package`, `/api/micropython-libs/download` conectado al índice oficial `micropython-lib v2`.
- **Intellisense C++/Arduino:** `/api/intellisense/types`, `/api/intellisense/symbols`.
- **LAN IoT Gateway con Inyección de Shim HTML:**
  - Rutas `/api/gateway/:client_id/*path` y `/iot/*`.
  - Inyecta dinámicamente un shim de interceptación (`window.__mcuMakerGatewayShim`) en páginas web de clientes para redirigir peticiones AJAX y Fetch a través del servidor hacia dispositivos físicos en red local.
- **Telemetría WebSocket en Tiempo Real:** `/api/simulation/ws/:client_id` para control bidireccional entre la simulación y dispositivos IoT externos.
- **Hardware Flasher SSE:** `/api/flash/upload` mediante Server-Sent Events (SSE) transmitiendo la salida de carga en vivo hacia la GUI.
- **Proxy de Noticias:** `/api/news/feed` con caché en memoria.
- **Servidor SPA Embebido:** Sirve estáticamente `frontend/dist/` con enrutamiento fallback a `index.html`.

---

## 📂 Estructura del Proyecto Rust

```
rust/
├── Cargo.toml                  # Workspace Rust multi-crate
├── crates/
│   ├── mcu-maker-server/       # Servidor Backend HTTP/WebSocket/SSE en Axum
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       ├── config.rs
│   │       ├── handlers/       # compilation, libraries, gateway, flash, websocket
│   │       └── models/         # DTOs y serialización de tipos
│   ├── mcu-maker-launcher/     # GUI de Escritorio Nativa (eframe/egui)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs         # Punto de entrada y runtime eframe
│   │       ├── app.rs          # Interfaz de usuario por tarjetas estilo ArtCraft
│   │       ├── theme.rs        # Paleta de colores Dark Slate & Electric Cyan
│   │       └── process.rs      # Supervisor de procesos y buffer de logs
│   └── mcu-maker-worker/       # Worker de Simulación QEMU en proceso aislado
│       ├── Cargo.toml
│       └── src/
│           └── main.rs         # Carga dinámica de libqemu y ejecución de VMs
└── target/
    └── release/
        ├── mcu-maker-server.exe
        ├── mcu-maker-launcher.exe
        └── mcu-maker-worker.exe
```

---

## ⚡ Cómo Ejecutar

### Opción 1: Lanzador Nativo con Interfaz Gráfica (Recomendado)
Haz doble clic en:
```bat
start-launcher.bat
```
O ejecuta desde PowerShell:
```powershell
.\rust\target\release\mcu-maker-launcher.exe
```
El launcher iniciará el servidor en `http://localhost:8001`, gestionará la conectividad Wi-Fi simulada y abrirá el simulador automáticamente.

---

## 🛠️ Compilación Manual

Para compilar ambos binarios en modo Release optimizado:
```powershell
cd rust
cargo build --release
```
Los ejecutables optimizados estarán disponibles en `rust/target/release/`.

---

## ⚖️ Autoría y Créditos

**MCU Maker** — Un proyecto basado en **Velxio.dev** con Backend 100% en Rust.  
**Desarrollador:** **Walther Curo De La Cruz**

- **Arquitectura Rust:** Servidor asíncrono con Axum/Tokio, Worker de emulación QEMU y Launcher nativo egui/eframe creados por Walther Curo De La Cruz.
- **Frontend y Base de Simulación:** Basado e inspirado en el frontend de código abierto de **[Velxio.dev](https://github.com/davidmonterocrespo24/velxio)** (creado por **David Montero Crespo**) bajo licencia **GNU AGPLv3**.
- **Núcleos de Emulación:** Motores de emulación basados en Wokwi (Uri Shaked), QEMU y ngspice-WASM.
