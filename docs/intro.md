# MCU Maker — Introducción a la Plataforma

<p align="center">
  <strong>MCU Maker — Un proyecto basado en Velxio.dev con Backend 100% en Rust</strong><br />
  <strong>Desarrollador:</strong> Walther Curo De La Cruz &nbsp;|&nbsp; <strong>Licencia:</strong> GNU AGPLv3
</p>

**MCU Maker** es un entorno interactivo y completo de **simulación electrónica y emulación de microcontroladores** de código abierto, diseñado para ejecutarse de forma **100% local, offline y sin dependencias en la nube** tanto en Windows como en el navegador web.

Permite escribir código en **Arduino C++**, **MicroPython** o ensamblador, compilarlo con cadenas de herramientas reales (`arduino-cli` / ESP-IDF) y simularlo con **emulación de CPU a ciclo exacto** — AVR8, RP2040, Xtensa (ESP32/S3), RISC-V (ESP32-C3) y ARM Cortex-M/Cortex-A — además de un motor analógico **SPICE completo (`ngspice-WASM`)** para leyes de Kirchhoff, transitorios, amplificadores operacionales, transistores y componentes pasivos.

Más de 24 placas de desarrollo, 5 arquitecturas de procesador, **más de 160 componentes electrónicos**, SDK para chips personalizados en WebAssembly y una suite nativa de escritorio en Rust.

---

## Supported Boards

19 boards across 5 CPU architectures:

| Family | Boards | Engine |
|--------|--------|--------|
| **AVR8** (browser) | Arduino Uno, Nano, Mega 2560, ATtiny85 | avr8js |
| **RP2040** (browser) | Raspberry Pi Pico, Pico W | rp2040js |
| **Xtensa LX6/LX7** (QEMU backend) | ESP32 DevKit V1, ESP32 DevKit C V4, ESP32-CAM, Wemos Lolin32 Lite, ESP32-S3 DevKit, XIAO ESP32-S3, Arduino Nano ESP32 | QEMU lcgamboa fork |
| **RISC-V RV32IMC** (QEMU backend) | ESP32-C3 DevKit, XIAO ESP32-C3, ESP32-C3 SuperMini | QEMU lcgamboa fork |
| **ARM Cortex-A** (QEMU backend) | Raspberry Pi Zero, Pi 1B+, Pi 2B, Pi 3B, Pi 4B, Pi 5 | QEMU `virt` / `raspi3b` |

Languages supported: **Arduino C++** on every board, **MicroPython** on Pico / Pico W / all ESP32 / ESP32-S3 / ESP32-C3 variants, **Python 3** on every Raspberry Pi.

See [Supported Boards](../README.md#supported-boards) for the full table with CPU clock speeds and FQBNs.

---

## What you can build

- **Digital sketches** — blink an LED, read a button, talk over Serial, drive an LCD, run a servo. The classic Arduino workflow, faster than flashing a real board.
- **Analog circuits** — 5V/GND rails, voltage dividers, op-amp filters, RC networks, transistor amplifiers. Probe with the on-canvas **voltmeter**, **ammeter**, and **oscilloscope**, or inject signals with the **function generator**.
- **Mixed-signal designs** — an ATmega reading a sensor through an op-amp buffer, an ESP32 driving a NeoPixel ring, a Pi 3 over UART to an Arduino acting as a slave. All co-simulated in one canvas.
- **Custom silicon** — model a 4-bit Intel 4004, a Z80, a 74HC595 shift register, or a 24LC256 EEPROM as a custom chip in C.
- **IoT prototypes** — ESP32 WiFi (SLIRP NAT), HTTP servers, MQTT, BLE advertising — all without a real radio.

---

## Documentation

### Getting Started

- [Getting Started](./getting-started.md) — Hosted, Docker, manual setup, desktop app
- [Roadmap](./roadmap.md) — What's implemented, in progress, planned

### Architecture & Internals

- [Architecture](./ARCHITECTURE.md) — Project-wide architecture (frontend, backend, simulation, QEMU bridge)
- [Emulator Architecture](./emulator.md) — How each CPU backend (AVR / RP2040 / Xtensa / RISC-V / ARM) works
- [Electrical Simulation](./wiki/electrical-simulation-user-guide.md) — Analog circuits, ngspice integration, instruments
- [Custom Chips — Developer Guide](./CUSTOM_CHIPS.md) — Write chips in C, compile to WebAssembly

### Boards & Emulation

- [RP2040 Emulation](./RP2040_EMULATION.md) — Pico / Pico W (ARM Cortex-M0+)
- [Pi Pico W WiFi Emulation](./PICO_W_WIFI_EMULATION.md) — CYW43 simulated radio
- [ESP32 Emulation](./ESP32_EMULATION.md) — Full Xtensa QEMU (GPIO, ADC, PWM, WiFi, I2C, SPI, RMT)
- [ESP32 WiFi/Bluetooth](./ESP32_WIFI_BLUETOOTH.md) — WiFi/BLE under QEMU
- [ESP32-C3 WiFi/Bluetooth](./ESP32C3_WIFI_BLUETOOTH.md) — RISC-V variant
- [RISC-V Emulation](./RISCV_EMULATION.md) — ESP32-C3 family
- [Raspberry Pi 3 Emulation](./RASPBERRYPI3_EMULATION.md) — BCM2837 / Pi OS / Python + GPIO shim
- [MicroPython Implementation](./MICROPYTHON_IMPLEMENTATION.md) — How `.py` runs on Pico and ESP32

### Components & Examples

- [Components Reference](./components.md) — 590+ components across 10 categories
- [Example Projects](./examples/README.md) — 380+ built-in projects (digital, analog, mixed, retro CPUs)

### Custom Chips Deep-Dive

- [Custom Chips Overview](./CUSTOM_CHIPS.md) — Quick start, design philosophy
- [API Reference](./wiki/custom-chips-api-reference.md) — Every `vx_*` function
- [Examples Walkthrough](./wiki/custom-chips-examples.md) — Gallery chips explained
- [Build & Test](./wiki/custom-chips-build-and-test.md) — Toolchain, sandbox
- [ESP32 Backend Runtime](./wiki/custom-chips-esp32-backend-runtime.md) — How chips load under QEMU
- [Chip-to-chip nets on ESP32](./wiki/custom-chips-chip-nets.md): Nets between chips, the cross-board bridge, which UART a chip is on

### Board buses (SPI, I2C, UART)

- [Board buses](./wiki/board-buses.md): A bus is a net on a board: membership by wiring, arbitration by chip select, address and TX/RX, the engine and device contracts, the diagnostics, the remote hosts
- [Part author guide](./wiki/board-buses-part-authoring.md): How to write an SPI, I2C or UART part, a board built-in, and the tests it must ship

### Electrical Simulation Deep-Dive

- [Overview](./wiki/circuit-emulation-overview.md) — High-level pitch and design
- [Architecture](./wiki/circuit-emulation-architecture.md) — Engine + bridges
- [Components](./wiki/circuit-emulation-components.md) — Analog/passive model coverage
- [MNA Solver](./wiki/circuit-emulation-mna-solver.md) — Modified Nodal Analysis details
- [ngspice Bridge](./wiki/circuit-emulation-ngspice.md) — WASM integration
- [AVR Bridge](./wiki/circuit-emulation-avr-bridge.md) — How digital pins drive SPICE nodes
- [ESP32 QEMU Bridge](./wiki/circuit-emulation-esp32-qemu.md) — Same for QEMU backends
- [Performance](./wiki/circuit-emulation-performance.md), [Gotchas](./wiki/circuit-emulation-gotchas.md), [Tests](./wiki/circuit-emulation-tests.md), [API](./wiki/circuit-emulation-api.md)

### Apps & Integrations

- [Desktop App](./desktop-app.md) — Tauri-based offline desktop build (Pro)
- [MCP Server](./MCP.md) — Model Context Protocol — drive Velxio from Claude / Cursor
- [Analytics](./analytics.md) — Self-hosted plausible / GA bridge

### Infrastructure

- [Build QEMU](./BUILD-QEMU.md) — Rebuild the lcgamboa QEMU fork from source
- [Boot Images](./BOOT_IMAGES.md) — Raspberry Pi kernel / DTB / SD assets
- [Third-Party Credits](./THIRD_PARTY.md)
- [Docker Infrastructure](./wiki/docker-infrastructure.md)

---

## Community & Links

- **Live demo:** [velxio.dev](https://velxio.dev)
- **GitHub:** [github.com/davidmonterocrespo24/velxio](https://github.com/davidmonterocrespo24/velxio)
- **Discord:** [discord.gg/3mARjJrh4E](https://discord.gg/3mARjJrh4E)
- **Sponsor:** [github.com/sponsors/davidmonterocrespo24](https://github.com/sponsors/davidmonterocrespo24)
