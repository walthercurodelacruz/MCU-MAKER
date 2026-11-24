#!/usr/bin/env bash
#
# install-deps-linux.sh - Instala dependencias del sistema, Node.js, Rust y Arduino CLI
# en Ubuntu 24.04+ / Debian 12+ para compilación y pruebas locales de MCU Maker.
#

set -euo pipefail

ARDUINO_CLI_VERSION="${ARDUINO_CLI_VERSION:-1.1.1}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==================================================================="
echo "      MCU MAKER - INSTALACIÓN DE DEPENDENCIAS (LINUX / UBUNTU)"
echo "==================================================================="

sudo apt-get update
sudo apt-get install -y \
  build-essential pkg-config libssl-dev dpkg-dev curl \
  libfdt1 libgl1 libx11-6 libxcursor1 libxrandr2 libxi6 \
  libxkbcommon0 libxkbcommon-x11-0 libwayland-client0 xdg-utils \
  nodejs npm

if ! command -v cargo >/dev/null 2>&1; then
  echo "--> Instalando Rust toolchain (rustup)..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1091
  [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
fi

if ! command -v arduino-cli >/dev/null 2>&1 && [ ! -x "$ROOT/prebuilt/arduino-cli-linux/arduino-cli" ]; then
  echo "--> Descargando arduino-cli v${ARDUINO_CLI_VERSION}..."
  mkdir -p "$ROOT/prebuilt/arduino-cli-linux"
  curl -fsSL "https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" \
    | tar -xz -C "$ROOT/prebuilt/arduino-cli-linux" arduino-cli
  chmod +x "$ROOT/prebuilt/arduino-cli-linux/arduino-cli"
fi

echo ""
echo "[OK] Dependencias listas. Siguiente paso sugerido:"
echo "     ./scripts/download-qemu-runtime.sh"
echo "     ./scripts/qa-local.sh"
