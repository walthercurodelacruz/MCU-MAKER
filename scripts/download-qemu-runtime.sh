#!/usr/bin/env bash
#
# download-qemu-runtime.sh - Descarga las librerías dinámicas QEMU (Xtensa y RISC-V)
# y archivos ROM necesarios para la simulación de ESP32, ESP32-S3 y ESP32-C3.
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PICSIMLAB_VERSION="0.9.3"
PICSIMLAB_DEB_URL="https://github.com/lcgamboa/picsimlab/releases/download/v${PICSIMLAB_VERSION}/PICSimLab_${PICSIMLAB_VERSION}_260920_Ubuntu_24.04.5_LTS_amd64.deb"

echo "==================================================================="
echo "       MCU MAKER - DESCARGADOR DE QEMU RUNTIME (LINUX)"
echo "==================================================================="

command -v curl >/dev/null 2>&1 || { echo "[ERROR] Se requiere curl."; exit 1; }
command -v dpkg-deb >/dev/null 2>&1 || { echo "[ERROR] Se requiere dpkg-deb (sudo apt install dpkg-dev)."; exit 1; }

TARGET_LINUX="$ROOT/prebuilt/qemu_runtime_linux"
TARGET_RUNTIME="$ROOT/prebuilt/qemu_runtime"
mkdir -p "$TARGET_LINUX" "$TARGET_RUNTIME"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "--> Descargando paquete oficial de PICSimLab v${PICSIMLAB_VERSION}..."
curl -fsSL -o "$TMP_DIR/picsimlab.deb" "$PICSIMLAB_DEB_URL"

echo "--> Extrayendo librerías libqemu-xtensa.so, libqemu-riscv32.so y ROMs..."
dpkg-deb -x "$TMP_DIR/picsimlab.deb" "$TMP_DIR/extracted"

cp -a "$TMP_DIR/extracted/usr/lib/picsimlab/qemu/libqemu-"*.so "$TARGET_LINUX/"
cp -a "$TMP_DIR/extracted/usr/lib/picsimlab/qemu/fw/"*.bin "$TARGET_LINUX/"
cp -r "$TMP_DIR/extracted/usr/lib/picsimlab/qemu/fw" "$TARGET_LINUX/"

echo "--> Descargando esp32s3_rev0_rom.bin oficial de Espressif..."
ESPRESSIF_QEMU_URL="https://github.com/espressif/qemu/releases/download/esp-develop-9.2.2-20260417/qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-x86_64-linux-gnu.tar.xz"
curl -fsSL "$ESPRESSIF_QEMU_URL" | tar -xJf - --strip-components=3 -C "$TARGET_LINUX" qemu/share/qemu/esp32s3_rev0_rom.bin
cp -a "$TARGET_LINUX/esp32s3_rev0_rom.bin" "$TARGET_LINUX/fw/"

# Sincronizar con prebuilt/qemu_runtime
cp -a "$TARGET_LINUX/"* "$TARGET_RUNTIME/"

echo ""
echo "[OK] Librerias QEMU y ROMs instaladas correctamente en:"
echo "     - $TARGET_RUNTIME"
echo "     - $TARGET_LINUX"
echo ""
echo "Archivos instalados:"
ls -lh "$TARGET_RUNTIME"
