# MCU Maker: Plataforma Abierta de Simulación de Microcontroladores y Circuitos

<p align="center">
  <strong>Simulador y emulador interactivo de electrónica y microcontroladores de código abierto (Web + Local)</strong><br />
  <strong>MCU Maker — Un proyecto basado en Velxio.dev con Backend 100% en Rust</strong><br />
  <strong>Desarrollador: Walther Curo De La Cruz</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg" alt="License: AGPLv3" />
  <img src="https://img.shields.io/badge/Version-1.0.0-brightgreen.svg" alt="Version 1.0.0" />
  <img src="https://img.shields.io/badge/Platform-Windows%2010%2F11%20x64%20%7C%20Web-orange.svg" alt="Platforms" />
  <img src="https://img.shields.io/badge/Core-Rust%20(Axum%20%2B%20Tokio)-red.svg" alt="Rust Core" />
  <img src="https://img.shields.io/badge/GUI-eframe%20%2F%20egui-blue.svg" alt="egui GUI" />
  <img src="https://img.shields.io/badge/SPICE-ngspice--WASM-purple.svg" alt="SPICE" />
  <img src="https://img.shields.io/badge/IoT-LAN%20Gateway%20Enabled-blueviolet.svg" alt="LAN Gateway" />
</p>

---

## 📑 Tabla de Contenidos
1. [¿Qué es MCU Maker?](#-qué-es-mcu-maker)
2. [Placas y Microcontroladores Disponibles](#-placas-y-microcontroladores-disponibles)
3. [Catálogo de Componentes Electrónicos](#-catálogo-de-componentes-electrónicos)
4. [Características Principales](#-características-principales)
5. [Instalación y Primeros Pasos](#-instalación-y-primeros-pasos)
6. [🔮 Roadmap y Futuras Versiones (FPGAs y Lógica Programable)](#-roadmap-y-futuras-versiones)
7. [Documentación Adicional](#-documentación-adicional)
8. [⚖️ Licencia, Autoría y Blindaje Legal](#️-licencia-autoría-y-blindaje-legal)
9. [🏷️ Marcas Registradas](#️-marcas-registradas)

---

## 📌 ¿Qué es MCU Maker?

**MCU Maker** es un entorno interactivo y completo de simulación electrónica y emulación de microcontroladores que opera de forma **100% local, offline y sin dependencias en la nube** en tu computadora, así como en cualquier navegador web moderno.

Combina **simulación analógica SPICE en tiempo real** (vía `ngspice-WASM`) con **emulación digital a ciclo exacto** para múltiples familias de microcontroladores y arquitecturas de procesador: **AVR8 (Arduino)**, **Xtensa (ESP32)**, **ARM Cortex-M (Raspberry Pi Pico, STM32)**, **RISC-V (ESP32-C3, CH32V003)** y **ARM Linux (Raspberry Pi 3)**.

Su arquitectura híbrida de alto rendimiento cuenta con un **motor de backend asíncrono y un launcher visual nativo reescritos al 100% en Rust**, garantizando tiempos de compilación instantáneos mediante caché SHA-256 y un consumo de memoria mínimo (< 25 MB).

---

## ⚡ Placas y Microcontroladores Disponibles

MCU Maker emula directamente el hardware y los periféricos de **más de 24 placas de desarrollo** y procesadores:

| Familia de CPU | Placas Soportadas | Núcleo de Emulación | Entornos / Lenguajes Soportados |
| :--- | :--- | :--- | :--- |
| **Arduino (AVR8 8-bit)** | Arduino Uno R3, Arduino Nano, Arduino Mega 2560, ATtiny85 (DIP-8), Franzininho DIY | `avr8js` (16 MHz ciclo exacto) | Arduino C++, Ensamblador AVR |
| **ESP32 (Xtensa Dual-Core)** | ESP32 DevKit V1, DevKit-C V4, ESP32-CAM (OV2640), ESP32-S3 DevKit, XIAO ESP32-S3, Arduino Nano ESP32, Wemos Lolin32 | QEMU Xtensa LX6/LX7 dual-core | Arduino C++, MicroPython, ESP-IDF |
| **ESP32 RISC-V (32-bit)** | ESP32-C3 DevKitM-1, WCH CH32V003 (RV32EC) | QEMU RISC-V 32 bits | Arduino C++, ESP-IDF |
| **Raspberry Pi Pico (RP2040)** | Raspberry Pi Pico, Raspberry Pi Pico W (Wi-Fi CYW43439 integrado) | `rp2040js` (Cortex-M0+ dual-core) | Arduino C++, MicroPython, C/C++ SDK |
| **STM32 (ARM Cortex-M)** | Blue Pill (STM32F103C8T6), Black Pill (STM32F401 / STM32F411) | Emulación ARM Cortex-M | Arduino C++ (STM32duino) |
| **SBCs Linux (ARM64)** | Raspberry Pi 3 (ARM Cortex-A53) | QEMU ARM Linux | Linux Embebido, Python 3, Bash |
| **Procesadores Clásicos** | Zilog Z80, Intel 8080, Intel 4004 | SDK C-to-WASM Custom Chips | Ensamblador clásico, bytecode |

> 📖 Para consultar el inventario técnico exhaustivo de pines, memorias flash/SRAM y periféricos, consulta **[docs/BOARDS_AND_COMPONENTS.md](docs/BOARDS_AND_COMPONENTS.md)**.

---

## 🧩 Catálogo de Componentes Electrónicos

El simulador incluye más de **160 componentes interactivos** listos para colocar en protoboard o diagrama:

* **Sensores:** Ultrasonido HC-SR04, Temperatura y Humedad DHT11 / DHT22, Barómetro BMP280, Acelerómetro y Giroscopio MPU6050 (I2C), Potenciómetros, Fotoresistencias (LDR), Termistores NTC.
* **Salidas y Actuadores:** LEDs de colores individuales, tiras y matrices Neopixel (WS2812B), Servomotores analógicos y digitales, Relés electromecánicos de 5V, Zumbadores piezoeléctricos (Buzzer pasivo/activo).
* **Pantallas y Displays:** Display OLED monocromático SSD1306 (I2C y SPI, 128x64 / 128x32), Pantalla LCD de caracteres 16x2 y 20x4 (con o sin mochila I2C PCF8574), Displays de 7 segmentos (1 y 4 dígitos con multiplexado), Pantallas de papel electrónico (e-Paper).
* **Circuitos Integrados Digitales:** Compuertas lógicas estándar (74HC00, 74HC04, 74HC08, 74HC32, 74HC86), Temporizador 555 astable/monoestable, Registro de desplazamiento 74HC595, Driver de motores Puente H L293D.
* **Módulos RTC y Almacenamiento:** Relojes en tiempo real DS1307 y DS3231 (I2C con respaldo de batería), Memoria EEPROM 24Cxxx, Módulo lector de tarjetas MicroSD (SPI con sistema de archivos FAT).
* **Componentes Analógicos y Pasivos:** Resistencias, Condensadores electrolíticos y cerámicos, Inductores, Diodos rectificadores, Diodos Zener, Transistores BJT (NPN 2N2222, PNP 2N3906), MOSFETs de canal N y P, Amplificadores operacionales LM358 / TL072 (motor `ngspice-WASM`).

---

## 🚀 Características Principales

### 🌐 1. Pasarela IoT en Red Local (LAN IoT Gateway)
Cuando compilas un sketch en un ESP32 o Raspberry Pi Pico W que levanta un servidor web (`WiFiServer`, `WebServer`), MCU Maker mapea automáticamente los sockets virtuales y expone una URL accesible desde cualquier teléfono inteligente, tablet o laptop conectada a tu misma red Wi-Fi:
```
http://[IP_DE_TU_PC]:8001/iot/
```
Permite probar interfaces web para domótica, dashboards IoT y controles remotos desde tu smartphone físico sin comprar hardware adicional.

### ⚡ 2. Launcher de Escritorio Nativo (100% Rust)
* Desarrollado con el framework **eframe / egui** con aceleración OpenGL.
* Interfaz moderna en tonos *Dark Slate & Electric Cyan* con tipografía **Roboto** e iconos vectoriales **Font Awesome 6**.
* Gestión y supervisión del servidor en segundo plano en 1 solo clic.
* Consola de registros y eventos en tiempo real con niveles de severidad (`INFO`, `WARN`, `ERROR`, `SERVER`) y copia al portapapeles.
* Selector visual de puertos de escucha y configuración de Wi-Fi simulada (Modo Universal con redirección automática o Filtro SSID exacto).

### 🔬 3. Motor de Co-Simulación Digital y Analógica SPICE
Simulación híbrida en tiempo real donde las señales PWM, GPIO y voltajes del microcontrolador interactúan directamente con circuitos analógicos resueltos con precisión matemática mediante **ngspice-WASM**.

### 📐 4. Vista de Circuito y Vista Esquemática
* **Vista Circuito:** Lienzo interactivo para protoboards con trazado fluido de cables por color, detección de nodos y arrastre de componentes.
* **Vista Esquemático:** Diagrama esquemático electrónico de alto contraste y fondo cálido claro, listo para exportación gráfica en alta resolución o impresión directa para informes de laboratorio y tareas académicas.

---

## 📦 Instalación y Primeros Pasos

### Opción 1: Instalador Oficial para Windows (Recomendado)
1. Descarga el ejecutable desde la carpeta de distribución:
   ```
   dist-installer/MCU-Maker-Setup-v1.0.0.exe
   ```
2. Ejecuta el instalador. Permite instalación sin permisos de administrador (en `%LocalAppData%\Programs\MCU Maker`) o como Administrador para toda la máquina.
3. Al finalizar, inicia **MCU Maker** desde el acceso directo del Escritorio o Menú Inicio. El lanzador abrirá automáticamente tu navegador en `http://localhost:8001`.

### Opción 2: Ejecución Portable en 1 Clic
Si clonaste el repositorio, en la raíz del proyecto ejecuta:
```bat
start-launcher.bat
```
El script detectará los binarios optimizados en `rust/target/release/` (o los compilará si faltan) e iniciará la aplicación de inmediato.

### Opción 3: Ejecución Manual para Desarrolladores
```bash
# 1. Compilar y ejecutar el servidor Rust
cd rust
cargo run --release -p mcu-maker-server -- --port 8001

# 2. Ejecutar el frontend en modo desarrollo (opcional)
cd ../frontend
npm install
npm run dev
```

---

## 🔮 Roadmap y Futuras Versiones

El desarrollo de MCU Maker avanza activamente hacia la integración de tecnologías de hardware avanzadas:

### ⚡ Simulación de FPGAs Clásicas y Lógica Programable
Incorporación de placas y silicios FPGA de referencia didáctica y maker:
* **Modelos en evaluación:** **Lattice iCE40** (iCEstick, iCEBreaker UP5K, TinyFPGA BX), **Gowin Tang Nano 9K/20K**, **Xilinx Spartan-6** y **Digilent Basys 3** (Artix-7 XC7A35T).
* **Cadena de Herramientas 100% Abierta (Open Toolchain):** Síntesis RTL con **Yosys**, simulación a ciclo exacto con **CXXRTL / Verilator** (compilados a WebAssembly) y place & route virtual con **nextpnr**.
* **Lenguajes:** Soporte para **Verilog** (IEEE 1364), **SystemVerilog** sintetizable y **VHDL** (vía plugin GHDL-Yosys).
* **Co-Simulación FPGA ↔ Microcontrolador:** Posibilidad de conectar pines de la FPGA simulada a microcontroladores (Arduino / ESP32) a través de buses SPI, I2C o GPIO en el mismo lienzo interactivo.

### 📡 Redes y Conectividad Inalámbrica Avanzada
* Emulación de protocolos de malla **ESP-NOW** entre múltiples módulos ESP32 coexistiendo en el mismo espacio virtual.
* Transceptores de radiofrecuencia **LoRa (SX1276 / SX1278)** para telemetría de largo alcance simulada.
* Periféricos simulados de **Bluetooth Low Energy (BLE)** (servicios GATT, notificaciones).

### 📊 Instrumentación Virtual de Laboratorio
* **Osciloscopio Digital de 2 Canales:** Con acoplamiento AC/DC, disparo por flanco (trigger) y análisis espectral FFT en vivo.
* **Analizador Lógico de 8 Canales:** Con decodificadores de tramas para protocolos I2C, SPI, UART y 1-Wire, con exportación a formato VCD (*Value Change Dump*).

### 🐧 Distribución Multiplataforma
* Empaquetado **AppImage** y **Flatpak** para distribuciones Linux (Ubuntu, Debian, Fedora, Arch).
* Paquetes **DMG** para macOS (Apple Silicon M1/M2/M3 y x86_64).

---

## 📖 Documentación Adicional

* **[`MANUAL_PROYECTO_V1.md`](MANUAL_PROYECTO_V1.md):** Manual integral del usuario, arquitectura interna, guía paso a paso y resolución de errores (Troubleshooting).
* **[`README_RUST.md`](README_RUST.md):** Documentación técnica de la suite en Rust (`mcu-maker-launcher`, `mcu-maker-server`, `mcu-maker-worker`).
* **[`docs/BOARDS_AND_COMPONENTS.md`](docs/BOARDS_AND_COMPONENTS.md):** Catálogo exhaustivo de especificaciones técnicas y memoria de las 24 placas y los 160 componentes.
* **[`docs/BUILD-QEMU.md`](docs/BUILD-QEMU.md):** Guía de compilación y enlace de DLLs del motor QEMU.

---

## ⚖️ Licencia, Autoría y Blindaje Legal

### Licencia de Software Libre
Este proyecto es software libre y de código abierto distribuido bajo los términos de la **[GNU Affero General Public License v3.0 (GNU AGPLv3)](LICENSE)**.

Eres libre de usar, estudiar, modificar y redistribuir este software, siempre y cuando cualquier versión modificada o trabajo derivado que se ofrezca a través de una red informática ponga a disposición de los usuarios el código fuente completo bajo esta misma licencia AGPLv3.

### Autoría y Créditos
**MCU Maker** — Un proyecto basado en **Velxio.dev** con Backend 100% en Rust.  
**Desarrollador Principal:** **Walther Curo De La Cruz**

* **Suite y Arquitectura Rust:** Motor de servidor asíncrono con Axum y Tokio, worker de emulación QEMU, pasarela LAN IoT y Launcher de escritorio desarrollados por Walther Curo De La Cruz (2026).
* **Reconocimiento al Proyecto Base:** Basado e inspirado en el frontend de código abierto de **[Velxio.dev](https://github.com/davidmonterocrespo24/velxio)** (creado por **David Montero Crespo**).
* **Núcleos de Emulación y SPICE:** Elementos de simulación basados en **Wokwi** (`avr8js` y `rp2040js` por Uri Shaked), motor analógico `ngspice-WASM` y emulación QEMU adaptada (fork `lcgamboa`).

En estricto cumplimiento con la Sección 5 de la GNU AGPLv3, todos los avisos de derechos de autor y licencias originales se conservan íntegros en el archivo [`LICENSE`](LICENSE), y todas las modificaciones y aportes se publican bajo la misma licencia libre recíproca.

---

## 🏷️ Marcas Registradas

* **Arduino®** es una marca registrada de *Arduino AG*.
* **ESP32®, ESP32-S3®, ESP32-C3® y Espressif®** son marcas registradas de *Espressif Systems (Shanghai) Co., Ltd.*
* **Raspberry Pi® y RP2040®** son marcas registradas de *Raspberry Pi Ltd*.
* **STM32®** es una marca registrada de *STMicroelectronics NV*.

Todos los nombres de placas, microcontroladores, logotipos y marcas comerciales mencionados en este proyecto se utilizan únicamente con fines descriptivos y de identificación de compatibilidad técnica en la emulación de hardware. **MCU Maker** es un proyecto comunitario independiente de código abierto y no está afiliado, patrocinado ni respaldado por ninguna de las entidades propietarias de dichas marcas.

---
*MCU Maker Suite v1.0.0 Oficial — 2026.*
