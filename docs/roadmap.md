# MCU Maker — Roadmap & Arquitectura de Evolución

<p align="center">
  <strong>MCU Maker — Un proyecto basado en Velxio.dev con Backend 100% en Rust</strong><br />
  <strong>Desarrollador:</strong> Walther Curo De La Cruz &nbsp;|&nbsp; <strong>Licencia:</strong> GNU AGPLv3
</p>

---

## Estado Actual y Funcionalidades Implementadas

### Editor de Código
- Editor integrado Monaco con resaltado de sintaxis C++, Python y Rust, autocompletado, minimapa y tema oscuro.
- **Espacio de trabajo multi-archivo:** Crear, renombrar, eliminar y alternar entre archivos `.ino`, `.h`, `.cpp`, `.py`, `.chip.c`.
- **Agrupación por placa:** Cada microcontrolador en el lienzo tiene su propio conjunto de archivos y sketch.
- Diálogo de confirmación para cambios no guardados y panel de explorador de archivos colapsable y redimensionable.

### Motor de Compilación
- Compilación local ultra-rápida vía `arduino-cli` (AVR, RP2040, ATtiny, ESP32).
- Caché SHA-256 inteligente en el backend de Rust (`artifacts/`), reduciendo recompilaciones a < 50 ms.
- Soporte para sketches multi-archivo con compilador asíncrono y monitor de salida en vivo.
- Pipeline de compilación de circuitos integrados personalizados (C -> WebAssembly vía Emscripten).

### Microcontroladores y Placas (24 Modelos en 5 Arquitecturas)
- **AVR8 (Navegador, `avr8js`):** Arduino Uno R3, Arduino Nano, Arduino Mega 2560, ATtiny85, Franzininho DIY.
- **RP2040 (`rp2040js`):** Raspberry Pi Pico, Raspberry Pi Pico W (Wi-Fi CYW43439 integrado).
- **Xtensa LX6/LX7 (QEMU Nativo):** ESP32 DevKit V1, DevKit-C V4, ESP32-CAM, Wemos Lolin32 Lite, ESP32-S3 DevKit, XIAO ESP32-S3, Arduino Nano ESP32.
- **RISC-V RV32IMC (QEMU Nativo):** ESP32-C3 DevKit, XIAO ESP32-C3, ESP32-C3 SuperMini, WCH CH32V003.
- **ARM Cortex-M & Cortex-A:** STM32 Blue Pill (F103), Black Pill (F401/F411), Raspberry Pi Zero / 1 / 2 / 3B / 4B / 5.
- **Procesadores Clásicos:** Zilog Z80, Intel 8080, Intel 4004 (SDK C-to-WASM).
- Arduino Nano (ATmega328P @ 16 MHz)
- Arduino Mega 2560 (ATmega2560 @ 16 MHz)
- ATtiny85 (8 MHz internal / 16 MHz external PLL)

#### RP2040 (browser, rp2040js)

- Raspberry Pi Pico (RP2040 @ 133 MHz)
- Raspberry Pi Pico W (RP2040 + simulated CYW43439 WiFi)

#### Xtensa LX6/LX7 (backend, lcgamboa QEMU)

- ESP32 DevKit V1, ESP32 DevKit C V4
- ESP32-CAM, Wemos Lolin32 Lite
- ESP32-S3 DevKit, XIAO ESP32-S3
- Arduino Nano ESP32

#### RISC-V RV32IMC (backend, lcgamboa QEMU)

- ESP32-C3 DevKit
- XIAO ESP32-C3
- ESP32-C3 SuperMini

#### ARM Cortex-A (backend, upstream QEMU)

- Raspberry Pi Zero (Cortex-A7)
- Raspberry Pi 1B+ (Cortex-A7)
- Raspberry Pi 2B (Cortex-A7)
- Raspberry Pi 3B (Cortex-A53, `raspi3b` machine)
- Raspberry Pi 4B (Cortex-A72)
- Raspberry Pi 5 (Cortex-A76)

### Languages

- **Arduino C++** on every board
- **MicroPython** on Pico / Pico W / all ESP32 / ESP32-S3 / ESP32-C3 variants
- **Python 3** on every Raspberry Pi (real Pi OS Trixie under QEMU)
- **ESP-IDF C** on all ESP32 variants

### Simulation peripherals

- **AVR** — PORTB/C/D, Timer0/1/2, USART (auto baud), ADC, hardware SPI + I2C
- **RP2040** — all 30 GPIO, UART0/UART1, ADC + temp sensor, I2C0/1, SPI0/1, PWM, WFI fast-forward
- **ESP32 (Xtensa)** — 40 GPIO with GPIO32–39 fix, UART0/1/2, ADC (0–3300 mV), I2C, SPI, RMT/NeoPixel, LEDC 16-channel PWM, WiFi (SLIRP NAT), BLE advertising
- **ESP32-C3 (RISC-V)** — GPIO 0–21, UART0, ADC1, WiFi/BLE via same SLIRP path
- **Pi family** — GPIO 0–27 via RPi.GPIO shim over `ttyAMA1`, user Serial on `ttyAMA0`, qcow2 overlay, multi-board UART bridge

### Electrical (analog) simulation

- **ngspice WASM engine** (lazy-loaded, ~39 MB chunk, behind a toolbar toggle)
- **NetlistBuilder** — Union-Find on wires, SPICE card emission per component
- **AVR <-> SPICE bridge** — digital outputs become Thevenin sources, ADCs read solved node voltages
- **ESP32 QEMU <-> SPICE bridge** — same pattern for QEMU backends
- **Analog instruments**: voltmeter, ammeter, oscilloscope (multi-channel + logic analyzer), function generator (sine/square/triangle/sawtooth)
- **Component models**: resistors, capacitors, inductors, diodes (1N4148/4007/Zener/Schottky/LED), transistors (NPN/PNP, MOSFET N/P), op-amps (LM358/TL081/LM741), comparators
- **Mixed-signal sanity** — pot wired to A0 reads the real voltage; op-amp follower between pot and A0 still works

### Custom Chips

- **C-to-WASM** SDK with `vx_*` primitives (GPIO, ADC, DAC, I2C/SPI slave, UART, timers, framebuffer, log)
- **30+ example chips** in the gallery: Intel 4001/4002/4004/4040/8080/8086 + 8251/8253/8255/8259, Z80, 74HC595, CD4094, 24C01, 24LC256, MCP3008, PCF8574, DS3231, 32K/1M ROM, 64K RAM, latch 8282, …
- **In-browser runtime** — `ChipRuntime` per instance, WASI shim, deterministic clock
- **Bus bridges** — I2C slave and SPI slave appear as real peripherals to the MCU
- **Backend variant** — chips can also run inside QEMU for ESP32-bound projects

### Components

- **152+ catalog components** across 11 categories (boards, sensors, displays, input, output, motors, logic, analog, passive, electromech, other)
- Component picker with search, category filters, and live previews
- Drag-and-drop repositioning, 90° rotation
- Property dialog: pin assignment, color, value, protocol selector
- Pin selector for explicit pin-to-board mapping
- Auto-generated metadata from upstream wokwi-elements source + Velxio-native override file

### Wire System

- Click-to-connect wire creation with L-shape preview
- Orthogonal routing, 20px grid snap
- 8 signal-type wire colors (VCC, GND, digital, analog, PWM, I2C, SPI, USART)
- Segment-based wire editing (drag perpendicular to segment orientation)
- Parallel-overlap auto-offset (no overlapping wires)
- Pin overlay with cyan/green hover states
- Auto-recalculation when components move (with retries for async-mounting board pins)

### Multi-Board Canvases

- Multiple boards on the same canvas, each with its own simulator instance, file group, Serial Monitor
- Shared electrical netlist — a wire between two boards is one SPICE node
- UART bridge between boards (TX of A → RX of B)
- Deterministic board IDs (first of a kind gets the bare `boardKind`)

### Serial Monitor

- Live serial output, per-board
- Auto baud-rate detection (reads UBRR for AVR, peripheral registers for RP2040 / ESP32)
- Send-to-RX from the UI
- Autoscroll toggle
- Multi-UART support on ESP32 (UART0/1/2)
- Pi: `ttyAMA0` user serial, `ttyAMA1` reserved for GPIO protocol

### Library Manager

- Browse and install the full Arduino library index from the UI
- Live search, installed tab, version display
- Persists installs in `/root/Arduino` (Docker volume `velxio-arduino-user-libs`)

### Portable Project Persistence

- **`.vlx` file format** — single-file JSON snapshot of boards, file groups, components, wires, VFS contents, electrical-sim state
- Save button = download `.vlx`; Open button = restore
- Versioned for forward compatibility
- **Zero server-side state in OSS** — your projects live wherever you put your `.vlx` files

### Examples Gallery

- **380+ built-in examples** across 7 collections:
  - Circuits (190) — pure analog, mixed-signal, transient demos
  - 100 Days of Code (57)
  - E-Paper Displays (70)
  - Retro Intel/Zilog Processors (43)
  - Analog (15)
  - Digital (7)
  - Pico W WiFi (4)
- Filter by board, category, difficulty
- One-click load into editor

### IoT Gateway

- HTTP proxy bridging a real browser to a simulated ESP32 web server
- AsyncWebServer / WebServer / HTTPClient all reachable from the host

### MCP Server

- **stdio mode** (`backend/mcp_server.py`) — Claude Desktop
- **SSE mode** (`backend/mcp_sse_server.py`, port 8002) — Cursor, web agents
- 7 tools: `compile_project`, `run_project`, `import_wokwi_json`, `export_wokwi_json`, `create_circuit`, `update_circuit`, `generate_code_files`

### Apps

- **Web (OSS + Pro)** — at velxio.dev
- **Desktop (Tauri)** — Pro, 30-day trial, deep-link sign-in, license cache + grace banner, ESP32 QEMU prompt

### Deploy

- Single-container Docker image (`Dockerfile.standalone`) published to GHCR + Docker Hub on push to `master`
- 5 named volumes for fast restarts (arduino libs, user libs, ccache, ESP-IDF build dir, sketch data)
- nginx reverse proxy in front of FastAPI inside the container
- Docker Compose for build-from-source

---

## In Progress

- **Wire validation** — short detection, missing-GND warnings, dangling-pin flags
- **Streaming compile output** — line-buffered toolchain log over WebSocket instead of waiting for the full process to finish
- **Wokwi diagram.json import improvements** — better part-mapping fallbacks for parts not in the Velxio catalog

---

## 🔮 Futuras Versiones & Expansión de Hardware

### ⚡ 1. FPGAs Clásicas y Lógica Programable (Open RTL Toolchain)
- **Placas y Silicios en Plan:**
  - **Lattice iCE40:** iCEstick (HX1K), iCEBreaker (UP5K con 128KB SPRAM), TinyFPGA BX (LP8K).
  - **Gowin Tang Nano 9K / 20K:** Silicios accesibles para makers con controladores de video y memoria.
  - **Xilinx Spartan-6 & Digilent Basys 3 (Artix-7 XC7A35T):** Plataformas insignia para docencia universitaria.
- **Cadena de Síntesis y Simulación Abierta (100% Libre / WASM):**
  - Síntesis RTL con **Yosys** (sin depender de suites pesadas privativas de 50GB).
  - Simulación a ciclo exacto en WebAssembly con **CXXRTL** y **Verilator**.
  - Soporte de lenguajes: **Verilog** (IEEE 1364), **SystemVerilog** sintetizable y **VHDL** (vía `ghdl-yosys-plugin`).
- **Co-Simulación FPGA ↔ MCU:**
  - Comunicación en vivo entre pines de la FPGA y microcontroladores (Arduino / ESP32) vía SPI, I2C y GPIOs.
  - Sondas de Analizador Lógico para inspeccionar buses y estados internos en tiempo real.

### 📡 2. Conectividad Inalámbrica y Redes Avanzadas
- Simulación de topologías de malla **ESP-NOW** entre múltiples nodos ESP32.
- Módulos transceptores **LoRa (SX1276 / SX1278)** para telemetría de largo alcance.
- Periféricos simulados de **Bluetooth Low Energy (BLE)** (servicios GATT, notificaciones).

### 📊 3. Instrumentación Virtual de Laboratorio
- **Osciloscopio Digital de 2 Canales:** Acoplamiento AC/DC, disparo (trigger) por flanco, análisis de frecuencia FFT.
- **Analizador Lógico Digital de 8 Canales:** Decodificador de tramas para I2C, SPI, UART y 1-Wire con exportación VCD (*Value Change Dump*).

### 🐧 4. Distribución Multiplataforma
- Paquetes universales **AppImage** y **Flatpak** para sistemas Linux (Ubuntu, Debian, Fedora, Arch).
- Paquetes **DMG** para macOS (Apple Silicon y x86_64).

---

## ⚖️ Licencia y Contribuciones

**MCU Maker** es un proyecto de código abierto distribuido bajo la licencia **GNU Affero General Public License v3.0 (GNU AGPLv3)**.

- **Desarrollador Principal:** Walther Curo De La Cruz
- **Basado e Inspirado en:** Velxio.dev (David Montero Crespo)
- **Reporte de Issues y Sugerencias:** Se reciben contribuciones y reportes directamente a través del repositorio oficial de GitHub de MCU Maker.

