#!/usr/bin/env bash
#
# download-qemu-runtime.sh - Descarga y sincroniza las librerías dinámicas QEMU
# (libqemu-xtensa.so y libqemu-riscv32.so), los 4 archivos ROM oficiales de ESP32
# (esp32-v3-rom.bin, esp32-v3-rom-app.bin, esp32c3-rom.bin, esp32s3_rev0_rom.bin),
# pyserial (prebuilt/python_libs/serial), Arduino CLI y las plataformas canónicas
# para Linux x86_64.
#
# Compatible con distribuciones Debian/Ubuntu (.deb) y Fedora/RHEL/openSUSE (.rpm).
# Uso: ./scripts/download-qemu-runtime.sh [--force] [--skip-cores]
#

set -euo pipefail

FORCE=0
SKIP_CORES=0
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
    --skip-cores) SKIP_CORES=1 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PICSIMLAB_VERSION="0.9.3"
PICSIMLAB_DEB_URL="https://github.com/lcgamboa/picsimlab/releases/download/v${PICSIMLAB_VERSION}/PICSimLab_${PICSIMLAB_VERSION}_260920_Ubuntu_24.04.5_LTS_amd64.deb"
ESPRESSIF_QEMU_URL="https://github.com/espressif/qemu/releases/download/esp-develop-9.2.2-20260417/qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-x86_64-linux-gnu.tar.xz"
ARDUINO_CLI_VERSION="${ARDUINO_CLI_VERSION:-1.1.1}"
ARDUINO_CLI_URL="https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz"
PYSERIAL_WHL_URL="https://files.pythonhosted.org/packages/07/bc/587a445451b253b285629263eb51c2d8e9bcea4fc97826266d186f96f558/pyserial-3.5-py2.py3-none-any.whl"
ADDITIONAL_URLS="https://espressif.github.io/arduino-esp32/package_esp32_index.json,https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json,http://drazzy.com/package_drazzy.com_index.json"

echo "==================================================================="
echo "     MCU MAKER - DESCARGADOR DE QEMU RUNTIME Y CLI (LINUX)"
echo "==================================================================="

command -v curl >/dev/null 2>&1 || { echo "[ERROR] Se requiere curl."; exit 1; }
command -v tar  >/dev/null 2>&1 || { echo "[ERROR] Se requiere tar."; exit 1; }

TARGET_LINUX="$ROOT/prebuilt/qemu_runtime_linux"
TARGET_RUNTIME="$ROOT/prebuilt/qemu_runtime"
TARGET_CLI="$ROOT/prebuilt/arduino-cli-linux"
TARGET_PYLIBS="$ROOT/prebuilt/python_libs"
mkdir -p "$TARGET_LINUX/fw" "$TARGET_RUNTIME/fw" "$TARGET_CLI" "$TARGET_PYLIBS"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# 1. Arduino CLI para Linux x86_64
if [ "$FORCE" -eq 1 ] || [ ! -x "$TARGET_CLI/arduino-cli" ]; then
  echo "--> Descargando Arduino CLI v${ARDUINO_CLI_VERSION} para Linux x86_64..."
  curl -fsSL "$ARDUINO_CLI_URL" | tar -xz -C "$TARGET_CLI" arduino-cli
  chmod +x "$TARGET_CLI/arduino-cli"
else
  echo "--> Arduino CLI ya presente en $TARGET_CLI/arduino-cli"
fi

# 1b. pyserial en prebuilt/python_libs (requerido por esptool.py de arduino-esp32 en Linux)
if [ "$FORCE" -eq 1 ] || [ ! -d "$TARGET_PYLIBS/serial" ]; then
  echo "--> Descargando pyserial 3.5 (pure Python) en $TARGET_PYLIBS..."
  curl -fsSL "$PYSERIAL_WHL_URL" -o "$TMP_DIR/pyserial.whl"
  python3 -c "import zipfile, sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$TMP_DIR/pyserial.whl" "$TARGET_PYLIBS"
else
  echo "--> pyserial ya presente en $TARGET_PYLIBS/serial"
fi

# 2. Librerías libqemu-xtensa.so, libqemu-riscv32.so y ROMs de PICSimLab
if [ "$FORCE" -eq 1 ] \
   || [ ! -f "$TARGET_LINUX/libqemu-xtensa.so" ] \
   || [ ! -f "$TARGET_LINUX/libqemu-riscv32.so" ] \
   || [ ! -f "$TARGET_LINUX/esp32-v3-rom.bin" ] \
   || [ ! -f "$TARGET_LINUX/esp32-v3-rom-app.bin" ] \
   || [ ! -f "$TARGET_LINUX/esp32c3-rom.bin" ]; then
  echo "--> Descargando paquete oficial de PICSimLab v${PICSIMLAB_VERSION}..."
  curl -fsSL -o "$TMP_DIR/picsimlab.deb" "$PICSIMLAB_DEB_URL"

  echo "--> Extrayendo librerías libqemu-xtensa.so, libqemu-riscv32.so y ROMs..."
  mkdir -p "$TMP_DIR/extracted"
  if command -v dpkg-deb >/dev/null 2>&1; then
    dpkg-deb -x "$TMP_DIR/picsimlab.deb" "$TMP_DIR/extracted"
  elif command -v ar >/dev/null 2>&1; then
    (cd "$TMP_DIR" && ar x picsimlab.deb && tar -xf data.tar.* -C "$TMP_DIR/extracted")
  else
    echo "[ERROR] Se requiere 'dpkg-deb' o 'ar' (binutils) para extraer el paquete."
    exit 1
  fi

  cp -a "$TMP_DIR/extracted/usr/lib/picsimlab/qemu/libqemu-"*.so "$TARGET_LINUX/"
  cp -a "$TMP_DIR/extracted/usr/lib/picsimlab/qemu/fw/"*.bin "$TARGET_LINUX/"
  cp -a "$TMP_DIR/extracted/usr/lib/picsimlab/qemu/fw/"*.bin "$TARGET_LINUX/fw/"
else
  echo "--> Librerías QEMU de PICSimLab ya presentes en $TARGET_LINUX"
fi

# 3. esp32s3_rev0_rom.bin oficial de Espressif
if [ "$FORCE" -eq 1 ] || [ ! -f "$TARGET_LINUX/esp32s3_rev0_rom.bin" ]; then
  echo "--> Descargando esp32s3_rev0_rom.bin oficial de Espressif..."
  curl -fsSL "$ESPRESSIF_QEMU_URL" | tar -xJf - --strip-components=3 -C "$TARGET_LINUX" qemu/share/qemu/esp32s3_rev0_rom.bin
fi
cp -a "$TARGET_LINUX/esp32s3_rev0_rom.bin" "$TARGET_LINUX/fw/esp32s3_rev0_rom.bin"

# 4. Asegurar que las 4 ROMs existan tanto en la raíz como en fw/ y sincronizar con prebuilt/qemu_runtime
for rom in esp32-v3-rom.bin esp32-v3-rom-app.bin esp32c3-rom.bin esp32s3_rev0_rom.bin; do
  if [ -f "$TARGET_LINUX/fw/$rom" ] && [ ! -f "$TARGET_LINUX/$rom" ]; then
    cp -a "$TARGET_LINUX/fw/$rom" "$TARGET_LINUX/$rom"
  elif [ -f "$TARGET_LINUX/$rom" ] && [ ! -f "$TARGET_LINUX/fw/$rom" ]; then
    cp -a "$TARGET_LINUX/$rom" "$TARGET_LINUX/fw/$rom"
  fi
done

cp -a "$TARGET_LINUX/"* "$TARGET_RUNTIME/"

# 5. Pre-instalar las 4 plataformas canónicas de Arduino si faltan
if [ "$SKIP_CORES" -eq 0 ] && [ -x "$TARGET_CLI/arduino-cli" ]; then
  mkdir -p "$HOME/.arduino15"
  if [ ! -f "$HOME/.arduino15/arduino-cli.yaml" ]; then
    cat > "$HOME/.arduino15/arduino-cli.yaml" <<'EOF'
board_manager:
  additional_urls:
    - https://espressif.github.io/arduino-esp32/package_esp32_index.json
    - https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json
    - http://drazzy.com/package_drazzy.com_index.json
EOF
  fi
  INSTALLED_CORES="$("$TARGET_CLI/arduino-cli" --config-file "$HOME/.arduino15/arduino-cli.yaml" core list 2>/dev/null || true)"
  MISSING_ANY=0
  for core_id in "arduino:avr" "ATTinyCore:avr" "esp32:esp32" "rp2040:rp2040"; do
    if ! echo "$INSTALLED_CORES" | grep -q "$core_id"; then
      MISSING_ANY=1
    fi
  done
  if [ "$MISSING_ANY" -eq 1 ]; then
    echo "--> Actualizando índice de plataformas de Arduino CLI..."
    "$TARGET_CLI/arduino-cli" --config-file "$HOME/.arduino15/arduino-cli.yaml" core update-index --additional-urls "$ADDITIONAL_URLS" || true
    for core_spec in "arduino:avr" "ATTinyCore:avr" "esp32:esp32@2.0.17" "rp2040:rp2040"; do
      core_id="${core_spec%@*}"
      if ! echo "$INSTALLED_CORES" | grep -q "$core_id"; then
        echo "--> Pre-instalando plataforma $core_spec para uso inmediato..."
        "$TARGET_CLI/arduino-cli" --config-file "$HOME/.arduino15/arduino-cli.yaml" core install "$core_spec" --additional-urls "$ADDITIONAL_URLS" || true
      fi
    done
  else
    echo "--> Las 4 plataformas canónicas de Arduino (AVR, ATtinyCore, ESP32, RP2040) ya están instaladas."
  fi
fi

echo ""
echo "[OK] Librerías QEMU, ROMs, pyserial y Arduino CLI instalados correctamente en:"
echo "     - $TARGET_RUNTIME"
echo "     - $TARGET_LINUX"
echo "     - $TARGET_CLI"
echo "     - $TARGET_PYLIBS"
