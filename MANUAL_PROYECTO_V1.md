# MCU Maker — Manual Integral del Proyecto, Instalación y Diagnóstico (v1.0.0)

<p align="center">
  <strong>MCU Maker — Un proyecto basado en Velxio.dev con Backend 100% en Rust</strong><br />
  <strong>Desarrollador:</strong> Walther Curo De La Cruz &nbsp;|&nbsp; <strong>Versión:</strong> 1.0.0 &nbsp;|&nbsp; <strong>Licencia:</strong> GNU AGPLv3
</p>

---

## 📋 1. Ficha Técnica y Resumen Ejecutivo

**MCU Maker** es una suite completa de simulación electrónica y emulación de microcontroladores diseñada para operar tanto de forma **100% local y offline** en Windows como a través del navegador web, sin depender de servicios en la nube, suscripciones de pago ni recolección de datos privados.

### Datos del Proyecto
- **Nombre Oficial:** MCU Maker Desktop Suite
- **Versión Actual:** 1.0.0 (Release Oficial para Windows)
- **Lema del Proyecto:** *Un proyecto basado en Velxio.dev con Backend 100% en Rust*
- **Desarrollador Principal:** **Walther Curo De La Cruz**
- **Base y Reconocimiento de Código Abierto:** Basado e inspirado en el frontend de **Velxio.dev** (creado por **David Montero Crespo**), bajo licencia **GNU AGPLv3**, incorporando componentes de emulación de **Wokwi** (`avr8js`, `rp2040js` por Uri Shaked), motor analógico `ngspice-WASM` y emulación QEMU adaptada.
- **Arquitectura de Software:** Suite híbrida de alto rendimiento con **Backend y Launcher nativos reescritos en Rust** y **Frontend SPA interactivo en React/TypeScript**.

---

## 🏛️ 2. Arquitectura del Sistema

El ecosistema de MCU Maker está desacoplado en componentes modulares para garantizar estabilidad, bajo consumo de memoria y ejecución en tiempo real:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MCU MAKER LAUNCHER                              │
│              (GUI nativa en Rust con eframe / egui)                    │
│    • Control de Servidor  • Consola de Eventos  • Ajustes Wi-Fi/Puerto  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Supervisa y arranca
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    MCU MAKER SERVER (Axum / Tokio)                     │
│               Puerto por defecto: http://localhost:8001                 │
│                                                                        │
│  ┌───────────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ Compilación Código    │  │ LAN IoT Gateway  │  │ Servidor SPA   │ │
│  │ (arduino-cli + SHA256)│  │ (Proxy Red Local)│  │ (frontend/dist)│ │
│  └───────────────────────┘  └──────────────────┘  └────────────────┘ │
│  ┌───────────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ WebSockets Telemetría │  │ Gestor Librerías │  │ Gestor Wi-Fi   │ │
│  │ (Comunicación en vivo)│  │ (Arduino & uPy)  │  │ (Universal AP) │ │
│  └───────────────────────┘  └──────────────────┘  └────────────────┘ │
└──────────────┬───────────────────────────────────────────┬─────────────┘
               │                                           │
               ▼                                           ▼
┌──────────────────────────────┐          ┌──────────────────────────────┐
│  SIMULATION WORKER (QEMU)    │          │  MCU MAKER STUDIO (Frontend) │
│ • libqemu-xtensa.dll (ESP32) │          │ • Vista Circuito (Protoboard)│
│ • libqemu-stm32.dll (ARM)    │          │ • Vista Esquemático limpio   │
│ • libqemu-riscv32.dll (C3)   │          │ • Motor SPICE (ngspice-WASM) │
└──────────────────────────────┘          └──────────────────────────────┘
```

### 2.1 Componentes del Núcleo

1. **`mcu-maker-launcher.exe` (Launcher Nativo en Rust):**
   - Interfaz visual moderna en tonos *Dark Slate & Electric Cyan* acelerada por hardware (OpenGL).
   - Tipografía oficial **Roboto** e iconografía vectorial **Font Awesome 6**.
   - Gestión del ciclo de vida del servidor (Inicio, Detención, Reinicio con 1 clic).
   - Monitoreo en tiempo real de logs del sistema con coloreado por nivel (`INFO`, `WARN`, `ERROR`, `SERVER`).
   - Configuración visual de red Wi-Fi y puerto sin necesidad de editar archivos JSON manualmente.

2. **`mcu-maker-server.exe` (Servidor Axum & Tokio):**
   - Servidor HTTP y WebSocket nativo en Rust con rendimiento ultra-rápido y consumo inferior a 25 MB de RAM.
   - Compilador de código Arduino C++ / ESP32 mediante `arduino-cli` con caché de artefactos SHA-256 (`artifacts/`).
   - Sirve la interfaz web estática precompilada (`frontend/dist`) y gestiona el enrutamiento SPA.
   - Expone la **Pasarela IoT en Red Local** (`/iot/` y `/api/gateway/`), permitiendo que celulares y dispositivos conectados a tu red WiFi interactúen con los servidores web creados en los microcontroladores simulados.

3. **`mcu-maker-worker.exe` (Worker de Simulación Aislado):**
   - Proceso independiente que carga dinámicamente las DLLs de simulación QEMU (`prebuilt/qemu_runtime/`).
   - Al ejecutarse en un proceso separado, si un sketch provoca una falla en la máquina virtual, el servidor web y el launcher permanecen 100% operativos.

4. **`MCU Maker Studio` (Frontend SPA):**
   - Simulador en tiempo real con más de 80 componentes electrónicos (LEDs, pulsadores, potenciómetros, sensores I2C/SPI, displays OLED, pantallas LCD, servomotores, compuertas lógicas, transistores, relés).
   - Vista Esquemática optimizada para documentación e impresión con fondo cálido claro.
   - Motor analógico `ngspice-WASM` para simulación precisa de leyes de Kirchhoff, transitorios RC/RL y semiconductores.

---

## 💻 3. Guía de Instalación en Windows

### Requisitos del Sistema
- **Sistema Operativo:** Windows 10 o Windows 11 (64 bits).
- **Procesador:** Intel o AMD x86_64 con soporte SSE2.
- **Memoria RAM:** Mínimo 2 GB (Recomendado 4 GB o superior).
- **Espacio en Disco:** 1.2 GB de espacio libre.
- **Navegador Web:** Chrome, Edge, Firefox, Brave u Opera actualizados con soporte WebAssembly.

---

### Opción A: Instalador Oficial (`MCU-Maker-Setup-v1.0.0.exe`) - Recomendado

1. **Descarga y Ejecución:**
   - Ejecuta el instalador `MCU-Maker-Setup-v1.0.0.exe`.
   - **Instalación estándar (sin permisos de administrador):** Por defecto se instala en tu carpeta de usuario (`AppData\Local\Programs\MCU Maker`), ideal para laboratorios de computación o computadoras escolares/universitarias donde no tienes clave de Administrador.
   - **Instalación para todos los usuarios:** Si ejecutas el instalador como Administrador, podrás instalarlo en `C:\Program Files\MCU Maker`.

2. **Asistente de Instalación:**
   - Selecciona el idioma (Español o Inglés).
   - Revisa y acepta los términos de la licencia GNU AGPLv3.
   - Marca la casilla **"Crear acceso directo en el escritorio"**.
   - Haz clic en **Instalar**.

3. **Primer Inicio:**
   - Al finalizar, el instalador ofrecerá ejecutar **MCU Maker Launcher**.
   - El lanzador levantará automáticamente el servidor en segundo plano y abrirá tu navegador en `http://localhost:8001`.

---

### Opción B: Versión Portable / Código Fuente (Desarrolladores)

Si clonaste o descargaste el repositorio completo desde Git:

1. **Requisitos de Desarrollo (solo para compilar desde cero):**
   - Rust toolchain (`cargo`, `rustc`) versión 1.80+.
   - Node.js 18+ (para editar o recompilar el frontend).
2. **Ejecución Directa:**
   - Haz doble clic en el archivo único:
     ```bat
     start-launcher.bat
     ```
   - El script detectará automáticamente los binarios optimizados en `rust\target\release\` (o los compilará si es la primera vez) y abrirá la suite de inmediato.

---

## 🚀 4. Guía de Uso Rápido

1. **Iniciar la Suite:**
   - Abre **MCU Maker** desde el acceso directo del escritorio o ejecutando `start-launcher.bat`.
   - Verifica en la barra superior del launcher que el indicador muestre `● ONLINE` en color verde.
2. **Abrir el Simulador:**
   - En la tarjeta **MCU Maker Studio**, haz clic en el botón azul **"Abrir Simulador en Navegador"**.
3. **Seleccionar o Construir un Circuito:**
   - Puedes abrir un ejemplo predefinido desde la barra de herramientas o añadir componentes desde el catálogo (Arduino Uno, ESP32, protoboard, LEDs, resistencias, sensores).
   - Conecta los pines haciendo clic en el terminal de origen y arrastrando hacia el terminal de destino. Puedes cambiar el color del cable en cualquier momento.
4. **Escribir o Cargar Código:**
   - En el panel derecho de código, escribe tu sketch Arduino en C++ o cárgalo desde un archivo `.ino` / `.cpp`.
5. **Simular:**
   - Presiona el botón verde de **Play / Iniciar Simulación**.
   - El código se compilará automáticamente en el backend y se transmitirá a la máquina virtual para su ejecución en tiempo real.
   - Puedes abrir el **Monitor Serial** en la parte inferior para observar impresiones `Serial.print` o enviar comandos a la placa.

---

## ⚙️ 5. Configuraciones y Red Local (LAN IoT Gateway)

### 5.1 Pasarela IoT para Celulares y Tablets
MCU Maker incluye un proxy inverso transparente que permite probar proyectos IoT de ESP32 desde tu teléfono móvil real conectado a tu red Wi-Fi:

1. Asegúrate de que tu computadora y tu celular estén conectados a la **misma red Wi-Fi**.
2. En la tarjeta **Pasarela IoT en Red Local** del launcher, observa la dirección IP LAN (ejemplo: `http://192.168.1.15:8001/iot/`).
3. Haz clic en **"Copiar URL para Celular"**.
4. Abre esa URL en el navegador de tu celular: podrás ver y controlar los servidores web (`WebServer`, `WiFiServer`) creados por tu código en el microcontrolador simulado.

### 5.2 Ajustes de Wi-Fi Simulada
En la pestaña **Configuración** del Launcher puedes ajustar cómo interactúa el simulador con la red:
- **Modo Universal (Recomendado):** Permite que tu código utilice cualquier nombre de red SSID (por ejemplo `WiFi.begin("MI_CASA", "1234");`) y el simulador lo conectará automáticamente sin que tengas que modificar tu código.
- **Filtro SSID Exacto:** Si deseas simular validación estricta de credenciales de red.

---

## 🔍 6. Diagnóstico y Reporte de Errores (Troubleshooting)

### Problema 1: El indicador muestra `● DETENIDO` y el servidor no inicia
- **Causa común:** El puerto `8001` está ocupado por otra aplicación o una instancia anterior del servidor no se cerró correctamente.
- **Solución:**
  1. En el Launcher, ve a la pestaña **Configuración**.
  2. Cambia el puerto de `8001` a otro disponible (por ejemplo `8005` o `8080`).
  3. Haz clic en **"Guardar y Reiniciar Servidor"**.
  4. Alternativamente, abre el Administrador de Tareas de Windows (`Ctrl + Shift + Esc`), busca `mcu-maker-server.exe` y finaliza la tarea.

### Problema 2: Error de compilación en el sketch ("Error al compilar")
- **Causa común:** Sintaxis incorrecta en el código C++, falta una librería requerida o el modelo de placa seleccionado no es compatible con el código.
- **Solución:**
  1. Revisa la consola de errores en el editor de código (panel inferior).
  2. Si modificaste librerías o experimentas errores de compilación extraños, ve a **Configuración** en el Launcher y presiona el botón **"Purgar Caché de Compilación"** para limpiar artefactos antiguos.

### Problema 3: Error de simulación ESP32 ("DLL de simulación no encontrada")
- **Causa común:** Falta la carpeta `prebuilt\qemu_runtime\` o sus dependencias MinGW en la ruta de instalación.
- **Solución:**
  - Asegúrate de haber instalado MCU Maker mediante el instalador oficial o de no haber eliminado la carpeta `prebuilt\qemu_runtime\`.
  - Verifica que los archivos `libqemu-xtensa.dll` y `esp32-v3-rom.bin` existan en la carpeta de instalación.

### Problema 4: Cómo reportar un error o bug
Si encuentras un comportamiento inesperado:
1. Abre **MCU Maker Launcher**.
2. Ve a la pestaña **Consola de Eventos**.
3. Haz clic en el botón **"Copiar Todo"** en la esquina superior derecha.
4. Pega los registros copiados junto con una descripción detallada del problema en el repositorio oficial de GitHub o en el canal de soporte.

---

## ⚖️ 7. Licencia, Autoría y Propiedad Intelectual

### Licencia de Software Libre
Este software se distribuye bajo la licencia **GNU Affero General Public License v3.0 (GNU AGPLv3)**. Consulta el archivo [`LICENSE`](LICENSE) para conocer el texto legal completo.

### Créditos y Atribuciones
**MCU Maker** — Un proyecto basado en **Velxio.dev** con Backend 100% en Rust.  
**Desarrollador:** **Walther Curo De La Cruz**

- **Suite y Arquitectura Rust:** Motor de backend asíncrono con Axum y Tokio, worker de emulación QEMU, pasarela IoT en red local y Launcher gráfico de escritorio desarrollados por Walther Curo De La Cruz.
- **Proyecto Base:** Basado e inspirado en el frontend de código abierto de **[Velxio.dev](https://github.com/davidmonterocrespo24/velxio)**, concebido y desarrollado por **David Montero Crespo**.
- **Núcleos de Emulación Abiertos:**
  - **Uri Shaked / Wokwi:** Motores de emulación de microcontroladores `avr8js` y `rp2040js`, librerías de elementos de circuito.
  - **lcgamboa:** Fork y librerías de emulación QEMU para ESP32 y PICSimLab.
  - **Proyecto ngspice:** Motor analógico SPICE compilado para WebAssembly.
- **Tipografías e Iconografía:** Tipografía Roboto (Apache 2.0 por Google) e iconos vectoriales Font Awesome 6 Free (CC BY 4.0 / SIL OFL 1.1).

### Aviso de Marcas Registradas
Arduino®, ESP32®, Raspberry Pi®, STM32® y todas las marcas registradas citadas en este software pertenecen a sus respectivos fabricantes y propietarios. Su mención es estrictamente con fines de referencia y compatibilidad técnica en la emulación de hardware. MCU Maker es un proyecto independiente de código abierto y no está afiliado ni patrocinado por ninguna de las entidades citadas.

---
*Manual generado para MCU Maker v1.0.0 Oficial — 2026.*
