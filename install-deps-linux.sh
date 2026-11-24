#!/usr/bin/env bash
#
# install-deps-linux.sh - Instala dependencias del sistema, Node.js, Rust, Arduino CLI,
# pyserial y las 4 plataformas canónicas de Arduino (AVR, ATtiny, ESP32, RP2040)
# en distribuciones Linux basadas en Debian/Ubuntu (.deb) y Fedora/RHEL/openSUSE (.rpm)
# para que MCU Maker v1.2.0 esté 100% listo al primer uso.
#

set -euo pipefail

ARDUINO_CLI_VERSION="${ARDUINO_CLI_VERSION:-1.1.1}"
PYSERIAL_WHL_URL="https://files.pythonhosted.org/packages/07/bc/587a445451b253b285629263eb51c2d8e9bcea4fc97826266d186f96f558/pyserial-3.5-py2.py3-none-any.whl"
ADDITIONAL_URLS="https://espressif.github.io/arduino-esp32/package_esp32_index.json,https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json,http://drazzy.com/package_drazzy.com_index.json"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==================================================================="
echo "    MCU MAKER - INSTALACIÓN DE DEPENDENCIAS (LINUX .DEB / .RPM)"
echo "==================================================================="

if command -v apt-get >/dev/null 2>&1; then
  echo "--> Detectado gestor de paquetes APT (Ubuntu / Debian)..."
  sudo apt-get update
  sudo apt-get install -y \
    build-essential pkg-config libssl-dev dpkg-dev rpm curl tar xz-utils \
    python3 python3-serial \
    libfdt1 libgcrypt20 zlib1g libgl1 libx11-6 libxcursor1 libxrandr2 libxi6 \
    libxkbcommon0 libxkbcommon-x11-0 libwayland-client0 xdg-utils \
    nodejs npm
elif command -v dnf >/dev/null 2>&1; then
  echo "--> Detectado gestor de paquetes DNF (Fedora / RHEL / Rocky / AlmaLinux)..."
  sudo dnf install -y \
    gcc gcc-c++ make pkgconf-pkg-config openssl-devel rpm-build dpkg curl tar xz \
    python3 python3-pyserial \
    libfdt libgcrypt zlib mesa-libGL libX11 libXcursor libXrandr libXi \
    libxkbcommon libxkbcommon-x11 libwayland-client xdg-utils \
    nodejs npm
elif command -v zypper >/dev/null 2>&1; then
  echo "--> Detectado gestor de paquetes Zypper (openSUSE)..."
  sudo zypper install -y \
    gcc gcc-c++ make pkg-config libopenssl-devel rpm-build dpkg curl tar xz \
    python3 python3-pyserial \
    libfdt1 libgcrypt20 libz1 Mesa-libGL1 libX11-6 libXcursor1 libXrandr2 libXi6 \
    libxkbcommon0 libxkbcommon-x11-0 libwayland-client0 xdg-utils \
    nodejs npm
else
  echo "[AVISO] No se detectó apt-get, dnf ni zypper. Verifique manualmente las dependencias del sistema."
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "--> Instalando Rust toolchain (rustup)..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1091
  [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
fi

CLI_BIN="$ROOT/prebuilt/arduino-cli-linux/arduino-cli"
if [ ! -x "$CLI_BIN" ]; then
  echo "--> Descargando arduino-cli v${ARDUINO_CLI_VERSION}..."
  mkdir -p "$ROOT/prebuilt/arduino-cli-linux"
  curl -fsSL "https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" \
    | tar -xz -C "$ROOT/prebuilt/arduino-cli-linux" arduino-cli
  chmod +x "$CLI_BIN"
fi

# Empaquetar pyserial puro en prebuilt/python_libs para esptool.py de ESP32
if [ ! -d "$ROOT/prebuilt/python_libs/serial" ]; then
  echo "--> Preparando pyserial en prebuilt/python_libs para esptool.py..."
  mkdir -p "$ROOT/prebuilt/python_libs"
  TMP_WHL="$(mktemp)"
  curl -fsSL "$PYSERIAL_WHL_URL" -o "$TMP_WHL"
  python3 -c "import zipfile, sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$TMP_WHL" "$ROOT/prebuilt/python_libs"
  rm -f "$TMP_WHL"
fi

# Pre-instalar las 4 plataformas canónicas de Arduino para compilación instantánea al primer uso
echo "--> Configurando e instalando plataformas canónicas de Arduino (AVR, ATtiny, ESP32, RP2040)..."
mkdir -p "$HOME/.arduino15"
cat > "$HOME/.arduino15/arduino-cli.yaml" <<'EOF'
board_manager:
  additional_urls:
    - https://espressif.github.io/arduino-esp32/package_esp32_index.json
    - https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json
    - http://drazzy.com/package_drazzy.com_index.json
EOF

"$CLI_BIN" --config-file "$HOME/.arduino15/arduino-cli.yaml" core update-index --additional-urls "$ADDITIONAL_URLS"
INSTALLED_CORES="$("$CLI_BIN" --config-file "$HOME/.arduino15/arduino-cli.yaml" core list || true)"
for core_spec in "arduino:avr" "ATTinyCore:avr" "esp32:esp32@2.0.17" "rp2040:rp2040"; do
  core_id="${core_spec%@*}"
  if ! echo "$INSTALLED_CORES" | grep -q "$core_id"; then
    echo "--> Instalando core $core_spec..."
    "$CLI_BIN" --config-file "$HOME/.arduino15/arduino-cli.yaml" core install "$core_spec" --additional-urls "$ADDITIONAL_URLS"
  else
    echo "--> Core $core_id ya está instalado."
  fi
done

echo ""
echo "[OK] Dependencias y toolchains listos. Siguiente paso sugerido:"
echo "     ./scripts/download-qemu-runtime.sh"
echo "     ./scripts/qa-local.sh --install --include-ignored"
echo "     ./build-installer.sh   # Genera paquete .deb"
echo "     ./build-rpm.sh         # Genera paquete .rpm"
