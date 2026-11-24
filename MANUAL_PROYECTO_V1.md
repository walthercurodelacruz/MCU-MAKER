# MCU Maker — Manual Integral del Proyecto, Instalación y Diagnóstico (v1.2.0)

<p align="center">
  <strong>MCU Maker — Un proyecto basado en Velxio.dev con Backend 100% en Rust</strong><br />
  <strong>Desarrollador Principal:</strong> Walther Curo De La Cruz &nbsp;|&nbsp; <strong>Versión:</strong> 1.2.0 &nbsp;|&nbsp; <strong>Licencia:</strong> GNU AGPLv3
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.2.0-10B981?style=for-the-badge&logo=semanticrelease&logoColor=white" alt="Version 1.2.0" />
  <img src="https://img.shields.io/badge/Desarrollador-Walther%20Curo%20De%20La%20Cruz-06B6D4?style=for-the-badge&logo=github&logoColor=white" alt="Desarrollador" />
  <img src="https://img.shields.io/badge/License-GNU%20AGPLv3-2563EB?style=for-the-badge&logo=gnu&logoColor=white" alt="GNU AGPLv3" />
</p>

---

## 1. Ficha Técnica y Resumen Ejecutivo

**MCU Maker** es una suite completa de simulación electrónica y emulación de microcontroladores diseñada para operar tanto de forma **100% local y offline** en Windows y Linux como a través del navegador web, sin depender de servicios en la nube, suscripciones de pago ni recolección de datos privados.

### Datos del Proyecto

- **Nombre Oficial:** MCU Maker Desktop Suite
- **Versión Actual:** `1.2.0` (Release Multiplataforma Windows / Linux)
- **Lema del Proyecto:** *Un proyecto basado en Velxio.dev con Backend 100% en Rust*
- **Desarrollador Principal:** **Walther Curo De La Cruz**
- **Base y Reconocimiento de Código Abierto:** Basado e inspirado en el frontend de **Velxio.dev** (creado por **David Montero Crespo**), bajo licencia **GNU AGPLv3**, incorporando componentes de emulación de **Wokwi** (`avr8js`, `rp2040js` por Uri Shaked), motor analógico `ngspice-WASM` y emulación QEMU adaptada.
- **Arquitectura de Software:** Suite híbrida de alto rendimiento con **Backend y Launcher nativos en Rust** y **Frontend SPA interactivo en React/TypeScript**.

---

## 2. Arquitectura del Sistema

El ecosistema de MCU Maker está desacoplado en componentes modulares para garantizar estabilidad, bajo consumo de memoria y ejecución en tiempo real:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        MCU MAKER LAUNCHER                              │
│              (GUI nativa en Rust con eframe / egui)                    │
│    • Control de Servidor  • Consola de Eventos  • Ajustes Wi-Fi/Puerto │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Supervisa y arranca
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    MCU MAKER SERVER (Axum / Tokio)                     │
│               Puerto por defecto: http://localhost:8001                │
│                                                                        │
│  ┌───────────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ Compilación Código    │  │ LAN IoT Gateway  │  │ Servidor SPA   │ │
│  │ (arduino-cli + SHA256)│  │ (Proxy Red Local)│  │ (frontend/dist)│ │
│  └───────────────────────┘  └──────────────────┘  └────────────────┘ │
│  ┌───────────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ WebSockets Telemetría │  │ Gestor Librerías │  │ Gestor Wi-Fi   │ │
│  │ (Estado WiFi + GPIO)  │  │ (Arduino & uPy)  │  │ (Universal AP) │ │
│  └───────────────────────┘  └──────────────────┘  └────────────────┘ │
└──────────────┬───────────────────────────────────────────┬─────────────┘
               │                                           │
               ▼                                           ▼
┌──────────────────────────────┐          ┌──────────────────────────────┐
│  SIMULATION WORKER (QEMU)    │          │  MCU MAKER STUDIO (Frontend) │
│ • libqemu-xtensa (.dll/.so)  │          │ • Vista Circuito (Protoboard)│
│ • libqemu-riscv32 (.dll/.so) │          │ • Vista Esquemático limpio   │
│ • ROMs esp32 / s3 / c3       │          │ • Motor SPICE (ngspice-WASM) │
└──────────────────────────────┘          └──────────────────────────────┘
```

### 2.1 Componentes del Núcleo

1. **`mcu-maker-launcher` (Launcher Nativo en Rust):**
   - Interfaz visual en tonos *Dark Slate & Electric Cyan* acelerada por hardware (OpenGL).
   - Tipografía oficial **Roboto** e iconografía vectorial.
   - Gestión del ciclo de vida del servidor (Inicio, Detención, Reinicio en 1 clic).
   - Monitoreo en tiempo real de logs del sistema con coloreado por nivel (`INFO`, `WARN`, `ERROR`, `SERVER`).
   - Configuración visual de red Wi-Fi y puerto sin necesidad de editar archivos JSON manualmente.
2. **`mcu-maker-server` (Servidor Axum & Tokio):**
   - Servidor HTTP y WebSocket nativo en Rust con bajo consumo de RAM.
   - Compilador de código Arduino C++ / ESP32 mediante `arduino-cli` con streaming en vivo, timeouts de seguridad y caché SHA-256 (`artifacts/`).
   - Sirve la interfaz web estática precompilada (`frontend/dist`) y gestiona el enrutamiento SPA.
   - Expone la **Pasarela IoT en Red Local** (`/iot/` y `/api/gateway/`), permitiendo interactuar desde el navegador o móvil con los servidores web (`WebServer`) creados en los microcontroladores simulados.
3. **`mcu-maker-worker` (Worker de Simulación Aislado):**
   - Proceso independiente que carga dinámicamente las librerías QEMU (`prebuilt/qemu_runtime/`) y sus ROMs oficiales.
   - El aislamiento de procesos garantiza que el servidor y el launcher permanezcan operativos ante cualquier fallo de firmware.
4. **`MCU Maker Studio` (Frontend SPA):**
   - Simulador en tiempo real para las **9 placas canónicas** y más de **160 componentes electrónicos**.
   - Vista Esquemática optimizada para documentación e impresión.
   - Motor analógico `ngspice-WASM` para simulación precisa de leyes de Kirchhoff, transitorios RC/RL y semiconductores.

---

## 3. Guía de Instalación en Windows

### Requisitos del Sistema

- **Sistema Operativo:** Windows 10 o Windows 11 (64 bits).
- **Procesador:** Intel o AMD x86_64 con soporte SSE2.
- **Memoria RAM:** Mínimo 2 GB (Recomendado 4 GB o superior).
- **Espacio en Disco:** 1.2 GB de espacio libre.
- **Navegador Web:** Chrome, Edge, Firefox, Brave u Opera actualizados con soporte WebAssembly.

### Opción A: Instalador Oficial — Recomendado

1. **Descarga y Ejecución:**
   - Ejecuta el instalador generado en `dist-installer/MCU-Maker-Setup-v1.2.0.exe` (compilado con `build-installer.bat`).
   - **Instalación estándar (sin permisos de administrador):** Por defecto se instala en `AppData\Local\Programs\MCU Maker`, ideal para laboratorios o equipos sin clave de Administrador.
   - **Instalación para todos los usuarios:** Si se ejecuta como Administrador, instala en `C:\Program Files\MCU Maker`.
2. **Asistente de Instalación:**
   - Selecciona el idioma (Español o Inglés).
   - Acepta los términos de la licencia GNU AGPLv3.
   - Marca **"Crear acceso directo en el escritorio"** y haz clic en **Instalar**.
3. **Primer Inicio:**
   - Al finalizar, el lanzador levantará el servidor en segundo plano y abrirá tu navegador en `http://localhost:8001`.

### Opción B: Versión Portable / Código Fuente (Desarrolladores)

1. **Requisitos de Desarrollo (para compilar desde cero):**
   - Rust toolchain (`cargo`, `rustc`) versión 1.80+.
   - Node.js 18+.
2. **Ejecución Directa:**
   ```bat
   start-launcher.bat
   ```

### 3.1 Guía de Instalación en Linux (`.deb`, `.rpm` y `.AppImage`)

- **Ubuntu 24.04 LTS+ / Debian 12+ (`.deb`):**
  ```bash
  sudo apt install ./dist-installer/mcu-maker_1.2.0_amd64.deb
  ```
- **Fedora 39+ / RHEL 9+ / Rocky / AlmaLinux / openSUSE (`.rpm`):**
  ```bash
  sudo dnf install ./dist-installer/mcu-maker-1.2.0-1.x86_64.rpm
  ```
- **Construcción desde Código Fuente en Linux:**
  ```bash
  ./install-deps-linux.sh
  ./scripts/download-qemu-runtime.sh
  ./build-installer.sh   # Genera .deb
  ./build-rpm.sh         # Genera .rpm
  ./build-appimage.sh    # Genera .AppImage
  ```

---

## 4. Guía de Uso Rápido

1. **Iniciar la Suite:** Abre **MCU Maker** desde el escritorio o ejecutando `start-launcher.bat`. Verifica que el indicador superior muestre `ONLINE`.
2. **Abrir el Simulador:** En la tarjeta **MCU Maker Studio**, haz clic en **"Abrir Simulador en Navegador"**.
3. **Construir un Circuito:** Selecciona una de las **9 placas canónicas** (Arduino Uno/Nano/Mega, ATtiny85, Pico/Pico W, ESP32 DevKit V1, ESP32-S3, ESP32-C3) o un ejemplo predefinido y conecta los componentes.
4. **Escribir o Cargar Código:** Edita tu sketch Arduino C++, MicroPython o ESP-IDF en el panel derecho.
5. **Simular:** Presiona **Play / Iniciar Simulación**. La tarjeta de compilación mostrará el avance en vivo y, al iniciar QEMU, podrás usar el **Monitor Serie**, **Osciloscopio** y **Pasarela IoT**.

---

## 5. Configuraciones y Red Local (LAN IoT Gateway)

### 5.1 Pasarela IoT para Navegador y Celulares

MCU Maker incluye un proxy inverso transparente para probar proyectos `WebServer` / `WiFiServer` de ESP32:

1. Inicia la simulación de tu sketch con `#include <WiFi.h>` y `WebServer`.
2. Puedes acceder al panel web desde:
   - El botón **"Pasarela IoT"** en el Launcher (`http://<IP_LOCAL>:8001/iot/`).
   - El indicador verde **Wi-Fi** en la parte superior del lienzo.
   - El enlace directo `http://192.168.4.15` dentro del **Monitor Serie**.

### 5.2 Ajustes de Wi-Fi Simulada

En la pestaña **Configuración** del Launcher puedes alternar entre:

- **Modo Universal (Recomendado):** Redirige cualquier `WiFi.begin("SSID", "PASS")` al AP virtual emulado (`Espressif`) sin modificar tu código.
- **Filtro SSID Exacto:** Simula validación estricta de credenciales.

---

## 6. Diagnóstico y Reporte de Errores (Troubleshooting)

### Problema 1: El indicador muestra `DETENIDO` y el servidor no inicia

- **Causa común:** El puerto `8001` está ocupado por otra instancia o aplicación.
- **Solución:** En el Launcher, cambia el puerto en **Configuración** (por ejemplo `8005`), haz clic en **"Guardar y Reiniciar Servidor"**, o finaliza `mcu-maker-server.exe` en el Administrador de Tareas.

### Problema 2: Error de compilación en el sketch

- **Causa común:** Error de sintaxis, librería faltante o cambio de dependencias en caché.
- **Solución:** Revisa la consola del editor. Si persiste un artefacto antiguo, utiliza **"Purgar Caché de Compilación"** en el Launcher.

### Problema 3: Error de simulación ESP32 (`DLL` o `ROM code binary not found`)

- **Causa común:** Falta `prebuilt\qemu_runtime\` o los archivos `.bin` ROM.
- **Solución:** Ejecuta `.\scripts\download-qemu-runtime.ps1` (Windows) o `./scripts/download-qemu-runtime.sh` (Linux) para garantizar que `libqemu-xtensa`, `libqemu-riscv32`, `esp32-v3-rom.bin`, `esp32-v3-rom-app.bin`, `esp32c3-rom.bin` y `esp32s3_rev0_rom.bin` estén presentes.

### Problema 4: Cómo reportar un error

1. Abre **MCU Maker Launcher** -> pestaña **Consola de Eventos**.
2. Haz clic en **"Copiar Todo"** y adjunta el log junto con los pasos para reproducir el problema.

---

## 7. Licencia, Autoría y Propiedad Intelectual

### Licencia de Software Libre

Este software se distribuye bajo la licencia **GNU Affero General Public License v3.0 (GNU AGPLv3)**. Consulta [`LICENSE`](LICENSE) para el texto legal completo.

### Créditos y Atribuciones

**MCU Maker v1.2.0** — Un proyecto basado en **Velxio.dev** con Backend 100% en Rust.  
**Desarrollador Principal:** **Walther Curo De La Cruz**

- **Suite y Arquitectura Rust:** Motor de backend asíncrono con Axum y Tokio, compilador con streaming en vivo, worker de emulación QEMU, pasarela IoT en red local y Launcher gráfico de escritorio desarrollados por **Walther Curo De La Cruz**.
- **Proyecto Base:** Basado e inspirado en el frontend de código abierto de **[Velxio.dev](https://github.com/davidmonterocrespo24/velxio)**, concebido y desarrollado por **David Montero Crespo**.
- **Núcleos de Emulación Abiertos:**
  - **Uri Shaked / Wokwi:** Motores `avr8js` y `rp2040js`, librerías de elementos de circuito.
  - **lcgamboa / Espressif:** Fork y librerías de emulación QEMU para ESP32 / PICSimLab.
  - **Proyecto ngspice:** Motor analógico SPICE compilado para WebAssembly.
- **Tipografías e Iconografía:** Tipografía Roboto (Apache 2.0 por Google) e iconos vectoriales Font Awesome 6 Free (CC BY 4.0 / SIL OFL 1.1).

### Aviso de Marcas Registradas

Arduino®, ESP32®, Raspberry Pi® y todas las marcas registradas citadas pertenecen a sus respectivos propietarios. Su mención es estrictamente con fines de referencia y compatibilidad técnica en la emulación de hardware.

---
*Manual actualizado para MCU Maker v1.2.0 Oficial — Desarrollador: Walther Curo De La Cruz (2026).*
