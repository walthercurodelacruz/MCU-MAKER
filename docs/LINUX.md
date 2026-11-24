# MCU Maker v1.2.0 en Ubuntu Desktop (24.04 LTS – 26.04)

<p align="left">
  <img src="https://img.shields.io/badge/Version-1.2.0-10B981?style=flat-square&logo=semanticrelease&logoColor=white" alt="Version 1.2.0" />
  <img src="https://img.shields.io/badge/Ubuntu-24.04%2B-E95420?style=flat-square&logo=ubuntu&logoColor=white" alt="Ubuntu" />
  <img src="https://img.shields.io/badge/Debian-12%2B-A81D33?style=flat-square&logo=debian&logoColor=white" alt="Debian" />
  <img src="https://img.shields.io/badge/Desarrollador-Walther%20Curo%20De%20La%20Cruz-06B6D4?style=flat-square&logo=github&logoColor=white" alt="Desarrollador" />
</p>

## Instalar

```bash
sudo apt install ./dist-installer/mcu-maker_1.2.0_amd64.deb
```

Se instala en `/opt/mcu-maker`, crea el comando `mcu-maker` y la entrada **MCU Maker** en el menú de aplicaciones. Los datos de usuario (`wifi_config.json`, caché de compilación) se guardan en `~/.local/share/mcu-maker`.

## Compilar el instalador (Ubuntu 24.04 recomendado)

```bash
sudo apt install build-essential pkg-config libssl-dev dpkg-dev curl nodejs npm
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
./install-deps-linux.sh
./scripts/download-qemu-runtime.sh
./build-installer.sh      # genera dist-installer/mcu-maker_<version>_amd64.deb
```

## Estado de compatibilidad por componente

| Componente | Estado Linux | Notas |
| :--- | :---: | :--- |
| Interfaz web (React SPA) | ![PASS](https://img.shields.io/badge/Status-PASS-10B981?style=flat-square) | Idéntica a Windows |
| Servidor Rust y Arduino CLI | ![PASS](https://img.shields.io/badge/Status-PASS-10B981?style=flat-square) | CLI de Linux descargado por `install-deps-linux.sh` |
| Lanzador (`egui`, Wayland y X11) | ![PASS](https://img.shields.io/badge/Status-PASS-10B981?style=flat-square) | Renderizado nativo OpenGL |
| Simulación AVR y RP2040 | ![PASS](https://img.shields.io/badge/Status-PASS-10B981?style=flat-square) | En navegador (`avr8js` / `rp2040js`) |
| Simulación ESP32 (QEMU) | ![QEMU](https://img.shields.io/badge/Runtime-QEMU%20.so-F59E0B?style=flat-square) | Requiere `download-qemu-runtime.sh` (`libqemu-xtensa.so`, `libqemu-riscv32.so` y ROMs) |

### Runtime QEMU para ESP32 en Linux

Ejecuta `./scripts/download-qemu-runtime.sh` antes de `./build-installer.sh` para descargar y sincronizar las librerías `.so` de PICSimLab junto con las ROMs (`esp32-v3-rom.bin`, `esp32-v3-rom-app.bin`, `esp32c3-rom.bin` y `esp32s3_rev0_rom.bin`) en `prebuilt/qemu_runtime_linux/` y `prebuilt/qemu_runtime/`.
