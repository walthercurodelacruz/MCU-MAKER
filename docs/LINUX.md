# MCU Maker en Ubuntu Desktop (24.04 LTS – 26.04)

## Instalar
```bash
sudo apt install ./mcu-maker_1.0.0_amd64.deb
```
Se instala en `/opt/mcu-maker`, crea el comando `mcu-maker` y la entrada **MCU Maker** en el menú de aplicaciones. Los datos de usuario (`wifi_config.json`, caché de compilación) se guardan en `~/.local/share/mcu-maker`.

## Compilar el instalador (en Ubuntu 24.04 para máxima compatibilidad)
```bash
sudo apt install build-essential pkg-config libssl-dev dpkg-dev curl nodejs npm
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
./build-installer.sh      # genera dist-installer/mcu-maker_1.0.0_amd64.deb
```

## Estado de compatibilidad por componente
| Componente | Linux |
|---|---|
| Interfaz web (React) | ✅ idéntica a Windows |
| Servidor Rust, compilación con Arduino CLI | ✅ (CLI de Linux descargado por el script) |
| Lanzador (egui, Wayland y X11) | ✅ |
| Simulación AVR (Uno/Nano/Mega/ATtiny85) y RP2040 (Pico/Pico W) | ✅ en el navegador |
| Simulación ESP32 (QEMU) | ⚠️ requiere `libqemu-xtensa.so` y `libqemu-riscv32.so` |

### Pendiente para ESP32 en Linux
El motor ESP32 carga la librería QEMU de PICSimLab. El repositorio solo trae las `.dll` de Windows. Hay que compilar el fork de QEMU de PICSimLab en Linux y colocar las `.so` resultantes (con sus dependencias) en `prebuilt/qemu_runtime_linux/` antes de ejecutar `build-installer.sh`. Sin ellas, el resto de la aplicación funciona y solo las placas ESP32 muestran un error indicando que falta la librería.
