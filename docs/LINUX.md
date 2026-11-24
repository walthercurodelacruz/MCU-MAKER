# MCU Maker v1.2.0 en Linux Desktop (Ubuntu / Debian `.deb` y Fedora / RHEL / openSUSE `.rpm`)

<p align="left">
  <img src="https://img.shields.io/badge/Version-1.2.0-10B981?style=flat-square&logo=semanticrelease&logoColor=white" alt="Version 1.2.0" />
  <img src="https://img.shields.io/badge/Ubuntu-24.04%2B-E95420?style=flat-square&logo=ubuntu&logoColor=white" alt="Ubuntu" />
  <img src="https://img.shields.io/badge/Debian-12%2B-A81D33?style=flat-square&logo=debian&logoColor=white" alt="Debian" />
  <img src="https://img.shields.io/badge/Fedora-39%2B%20%7C%20RHEL%209%2B-51A2DA?style=flat-square&logo=fedora&logoColor=white" alt="Fedora / RHEL" />
  <img src="https://img.shields.io/badge/Branch-Team__Linux-E95420?style=flat-square&logo=linux&logoColor=white" alt="Team_Linux" />
  <img src="https://img.shields.io/badge/Desarrollador-Walther%20Curo%20De%20La%20Cruz-06B6D4?style=flat-square&logo=github&logoColor=white" alt="Desarrollador" />
</p>

## 1. Instalación por Distribución

### A. Ubuntu 24.04 LTS+ / Debian 12+ y derivados (`.deb`)

```bash
sudo apt install ./dist-installer/mcu-maker_1.2.0_amd64.deb
```

Para desinstalar:

```bash
sudo apt remove mcu-maker
```

### B. Fedora 39+ / RHEL 9+ / Rocky / AlmaLinux / openSUSE (`.rpm`)

```bash
# En Fedora / RHEL / Rocky / AlmaLinux:
sudo dnf install ./dist-installer/mcu-maker-1.2.0-1.x86_64.rpm

# En openSUSE:
sudo zypper install ./dist-installer/mcu-maker-1.2.0-1.x86_64.rpm
```

Para desinstalar:

```bash
sudo dnf remove mcu-maker
```

### C. Paquete Portable Universal (`.AppImage`)

```bash
chmod +x ./dist-installer/MCU-Maker-1.2.0-x86_64.AppImage
./dist-installer/MCU-Maker-1.2.0-x86_64.AppImage
```

> [!NOTE]
> Los paquetes `.deb` y `.rpm` instalan la suite en `/opt/mcu-maker`, registran el ejecutable `/usr/bin/mcu-maker` y agregan **MCU Maker** al menú de aplicaciones de escritorio. Los datos de usuario (`wifi_config.json`, caché de compilación SHA-256 en `artifacts/`) se almacenan en `~/.local/share/mcu-maker`.

---

## 2. Compilar los Instaladores desde Código Fuente

```bash
# 1. Instalar dependencias del sistema (detecta automáticamente apt-get, dnf o zypper), Rust y Arduino CLI
./install-deps-linux.sh

# 2. Descargar y sincronizar el runtime QEMU (.so) y las 4 ROMs oficiales de ESP32
./scripts/download-qemu-runtime.sh

# 3. Ejecutar la suite integral de QA local (incluyendo pruebas de integración QEMU / Arduino CLI)
./scripts/qa-local.sh --install --include-ignored

# 4. Construir los paquetes de distribución para Linux
./build-installer.sh      # Genera dist-installer/mcu-maker_1.2.0_amd64.deb
./build-rpm.sh            # Genera dist-installer/mcu-maker-1.2.0-1.x86_64.rpm
./build-appimage.sh       # Genera dist-installer/MCU-Maker-1.2.0-x86_64.AppImage
```

---

## 3. Estado de Compatibilidad por Componente en Linux

| Componente | Estado Linux | Notas Técnicas |
| :--- | :---: | :--- |
| Interfaz web (React SPA) | ![PASS](https://img.shields.io/badge/Status-PASS-10B981?style=flat-square) | 100% paridad funcional con Windows (9 placas canónicas) |
| Servidor Rust (`mcu-maker-server`) y Arduino CLI | ![PASS](https://img.shields.io/badge/Status-PASS-10B981?style=flat-square) | TLS en Rust puro (`rustls-tls`) sin dependencia de `libssl.so` del host; streaming y caché SHA-256 |
| Lanzador (`egui`, Wayland y X11) | ![PASS](https://img.shields.io/badge/Status-PASS-10B981?style=flat-square) | Renderizado nativo OpenGL; resolución de manuales en `/opt/mcu-maker` |
| Simulación AVR y RP2040 | ![PASS](https://img.shields.io/badge/Status-PASS-10B981?style=flat-square) | En navegador (`avr8js` / `rp2040js`) + co-simulación analógica `ngspice-WASM` |
| Simulación ESP32 / ESP32-S3 / ESP32-C3 (QEMU) | ![PASS](https://img.shields.io/badge/Status-PASS-10B981?style=flat-square) | `libqemu-xtensa.so`, `libqemu-riscv32.so` y las 4 ROMs oficiales (`esp32-v3-rom.bin`, `esp32-v3-rom-app.bin`, `esp32c3-rom.bin`, `esp32s3_rev0_rom.bin`) |
| Pasarela IoT LAN (`/iot/` y `/api/gateway/`) | ![PASS](https://img.shields.io/badge/Status-PASS-10B981?style=flat-square) | Proxy HTTP con preservación de `<sessionId>::<boardId>` y eventos `wifi_status` |
| Empaquetado Nativo `.deb` y `.rpm` | ![PASS](https://img.shields.io/badge/Status-PASS-10B981?style=flat-square) | Generación verificada con `dpkg-deb` y `rpmbuild` |
