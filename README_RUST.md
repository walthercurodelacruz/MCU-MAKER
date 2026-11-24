# MCU Maker v1.2.0 — Reconstrucción Completa en Rust y Suite Nativa

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.2.0-10B981?style=for-the-badge&logo=semanticrelease&logoColor=white" alt="Version 1.2.0" />
  <img src="https://img.shields.io/badge/Rust-Axum%20%2B%20Tokio%20%2B%20egui-EA580C?style=for-the-badge&logo=rust&logoColor=white" alt="Rust Stack" />
  <img src="https://img.shields.io/badge/Desarrollador-Walther%20Curo%20De%20La%20Cruz-06B6D4?style=for-the-badge&logo=github&logoColor=white" alt="Desarrollador: Walther Curo De La Cruz" />
</p>

Este proyecto ha sido completamente reconstruido en **Rust**, eliminando dependencias de runtime lentas como Python/Uvicorn para el backend de simulación y herramientas de compilación, y adoptando un **Launcher de Escritorio Nativo de alto rendimiento**.

---

## Componentes Principales

### 1. `mcu-maker-launcher` (Launcher de Escritorio Nativo)

- **Framework UI:** Rust nativo con `eframe` / `egui` (renderizado acelerado por GPU vía OpenGL/Glow y `winit`).
- **Tema Visual:** *Dark Slate & Electric Cyan* (`#0b0f19`, `#131b2e`, acentos `#06b6d4` y verde esmeralda para estado activo).
- **Arquitectura Multitarea:** Canales MPSC para streaming asíncrono de logs, sondeo reactivo de salud del backend (`/health`), y supervisión de procesos con `try_wait()` sin congelar la interfaz.
- **Suite Cards:**
  - **MCU Maker Studio (Web IDE):** Estado del servidor, dirección de escucha, botón de inicio/parada, apertura en un clic en el navegador predeterminado.
  - **Rust Native Engine:** Control del motor Axum con monitor de telemetría y subprocesos.
  - **LAN IoT Gateway & Reverse Proxy:** Detección automática de la IP de red local (`192.168.x.x`), permitiendo acceder a los paneles web del ESP32 simulado desde cualquier navegador o dispositivo móvil en la red local.
  - **Consola de Logs en Tiempo Real:** Monitor con coloreado por nivel, auto-scroll y botón de limpieza.
  - **Pestaña de Configuración:** Selección de puerto (por defecto `8001`), opciones de inicio automático, purga de caché y configuración de Wi-Fi virtual.

### 2. `mcu-maker-server` (Motor de Servidor Axum en Rust)

Reconstrucción 1:1 en Rust con rendimiento nativo y bajo consumo de memoria:

- **Salud y Caché de Librerías:** `/health`, `/health/libcache`.
- **Compilación de Código con Streaming en Vivo:**
  - `/api/compile`, `/api/compile/start` y `/api/compile/status/:id`.
  - Streaming línea a línea de `arduino-cli`, timeouts explícitos, exclusión mutua para `core install` y caché SHA-256 (`artifacts/`).
- **Compilador de Chips Personalizados C -> WASM:** `/api/compile-chip` y `/api/compile-chip/status/:id`.
- **Conversor Intel HEX -> Binario:** `/api/compile-rom` con validación estricta de integridad.
- **Gestor de Librerías Arduino y MicroPython:** `/api/libraries/*` y `/api/micropython-libs/*`.
- **Intellisense C++/Arduino:** `/api/intellisense/type/:name` y `/api/intellisense/symbols/:spec`.
- **LAN IoT Gateway con Inyección de Shim HTML:**
  - Rutas `/api/gateway/:client_id/*path`, `/gateway/:client_id/*path` y `/iot/`.
  - Preserva identificadores `<sessionId>::<boardId>` e inyecta `window.__mcuMakerGatewayShim` para redirigir peticiones `fetch`/`XHR` hacia el servidor web virtual del ESP32.
- **Telemetría WebSocket en Tiempo Real:** `/api/simulation/ws/:client_id` con emisión automática de estados Wi-Fi (`initializing` / `got_ip`), GPIO, UART y sensores.
- **Hardware Flasher SSE:** `/api/flash/upload` con lectura concurrente `stdout`/`stderr`.
- **Servidor SPA Embebido:** Sirve `frontend/dist/` con fallback seguro y protección contra path traversal.

### 3. `mcu-maker-worker` (Worker de Simulación QEMU)

- Carga dinámica multiplataforma de `libqemu-xtensa` (`.dll`/`.so`) y `libqemu-riscv32` (`.dll`/`.so`).
- Resolución automática de ROMs oficiales (`esp32-v3-rom.bin`, `esp32-v3-rom-app.bin`, `esp32c3-rom.bin`, `esp32s3_rev0_rom.bin`) en `lib_dir`, `fw/` y directorio del ejecutable.
- Redirección limpia de `stdin`/`stdout` para aislar el canal JSON del multiplexor de QEMU.

---

## Estructura del Proyecto Rust

```text
rust/
├── Cargo.toml                  # Workspace Rust multi-crate
├── crates/
│   ├── mcu-maker-server/       # Servidor Backend HTTP/WebSocket/SSE en Axum
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       ├── config.rs
│   │       └── services/       # arduino_cli, compile, iot_gateway, simulation_ws, flash, etc.
│   ├── mcu-maker-launcher/     # GUI de Escritorio Nativa (eframe/egui)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs         # Punto de entrada y runtime eframe
│   │       ├── app.rs          # Interfaz de usuario por tarjetas
│   │       ├── theme.rs        # Paleta Dark Slate & Electric Cyan
│   │       └── process.rs      # Supervisor de procesos y buffer de logs
│   └── mcu-maker-worker/       # Worker de Simulación QEMU en proceso aislado
│       ├── Cargo.toml
│       └── src/
│           └── main.rs         # Carga dinámica de libqemu y ejecución de VMs
└── target/
    └── release/
        ├── mcu-maker-server(.exe)
        ├── mcu-maker-launcher(.exe)
        └── mcu-maker-worker(.exe)
```

---

## Cómo Ejecutar

### Opción 1: Lanzador Nativo con Interfaz Gráfica (Recomendado)

- **Windows:**
  ```bat
  start-launcher.bat
  ```
  o directamente:
  ```powershell
  .\rust\target\release\mcu-maker-launcher.exe
  ```
- **Linux:**
  ```bash
  ./rust/target/release/mcu-maker-launcher
  ```

---

## Compilación Manual

```bash
cd rust
cargo build --release --workspace
```

Los ejecutables optimizados estarán disponibles en `rust/target/release/`.

---

## Autoría y Créditos

- **Desarrollador Principal:** **Walther Curo De La Cruz** (2026) — Arquitectura Rust completa (`mcu-maker-server`, `mcu-maker-launcher`, `mcu-maker-worker`), pasarela IoT LAN y empaquetado multiplataforma.
- **Proyecto Base:** Basado e inspirado en el frontend de código abierto de **[Velxio.dev](https://github.com/davidmonterocrespo24/velxio)** (creado por **David Montero Crespo**) bajo licencia **GNU AGPLv3**.
- **Núcleos de Emulación:** Motores basados en **Wokwi** (`avr8js`, `rp2040js` por Uri Shaked), **QEMU (lcgamboa / Espressif)** y **ngspice-WASM**.
