#!/usr/bin/env bash
#
# build-installer.sh - Builds the official MCU Maker installer for Ubuntu Desktop
# (24.04 LTS and newer): mcu-maker_<version>_amd64.deb
#
# Linux counterpart of build-installer.bat (Windows / Inno Setup).
#
# Usage:   ./build-installer.sh
# Install: sudo apt install ./dist-installer/mcu-maker_1.0.0_amd64.deb
#
# Build on the OLDEST Ubuntu you want to support (24.04): binaries then run on
# every newer release (26.04 included) because glibc is forward compatible.
#
# Optional QEMU runtime for ESP32 simulation (Xtensa / RISC-V):
#   place libqemu-xtensa.so, libqemu-riscv32.so (+ their sibling .so files)
#   in prebuilt/qemu_runtime_linux/ before running this script.
#   Without them the .deb still works: AVR (Uno/Nano/Mega/ATtiny85) and
#   RP2040 (Pico/Pico W) run in the browser; only ESP32 boards are disabled.

set -euo pipefail

VERSION="1.0.0"
PKG="mcu-maker"
ARCH="amd64"
ARDUINO_CLI_VERSION="${ARDUINO_CLI_VERSION:-1.1.1}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

STAGE="${TMPDIR:-/tmp}/mcu-maker-stage-$$"
OUT="$ROOT/dist-installer/${PKG}_${VERSION}_${ARCH}.deb"
APPDIR="$STAGE/opt/$PKG"

echo "==================================================================="
echo "        MCU MAKER - CREADOR DE INSTALADOR (.deb) PARA UBUNTU"
echo "==================================================================="

[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

need() { command -v "$1" >/dev/null 2>&1 || { echo "[ERROR] Falta '$1'. $2"; exit 1; }; }
need cargo   "Instale Rust: https://rustup.rs"
need npm     "Instale Node.js 20+: sudo apt install nodejs npm"
need dpkg-deb "sudo apt install dpkg-dev"
need pkg-config "sudo apt install pkg-config libssl-dev build-essential"

# ── 1. Binarios Rust (release) ────────────────────────────────────────
echo "[1/5] Compilando suite Rust (release)..."
cargo build --manifest-path rust/Cargo.toml --release

# ── 2. Frontend ───────────────────────────────────────────────────────
echo "[2/5] Compilando interfaz web (frontend/dist)..."
if [ ! -f frontend/dist/index.html ]; then
  (cd frontend && npm ci && npm run build:docker)
fi

# ── 3. Arduino CLI (Linux) ────────────────────────────────────────────
echo "[3/5] Preparando Arduino CLI para Linux..."
CLI_DIR="$ROOT/prebuilt/arduino-cli-linux"
if [ ! -x "$CLI_DIR/arduino-cli" ]; then
  need curl "sudo apt install curl"
  mkdir -p "$CLI_DIR"
  curl -fsSL "https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" \
    | tar -xz -C "$CLI_DIR" arduino-cli
fi

# ── 4. Ensamblado del arbol del paquete ───────────────────────────────
echo "[4/5] Ensamblando paquete..."
rm -rf "$STAGE"
mkdir -p "$APPDIR/prebuilt/arduino-cli" "$APPDIR/prebuilt/qemu_runtime" \
         "$STAGE/DEBIAN" "$STAGE/usr/bin" \
         "$STAGE/usr/share/applications" "$STAGE/usr/share/pixmaps" \
         "$STAGE/usr/share/doc/$PKG"

for b in mcu-maker-launcher mcu-maker-server mcu-maker-worker; do
  install -m 0755 "rust/target/release/$b" "$APPDIR/$b"
done
install -m 0755 "$CLI_DIR/arduino-cli" "$APPDIR/prebuilt/arduino-cli/arduino-cli"
cp -r frontend/dist "$APPDIR/frontend-dist-tmp" && mkdir -p "$APPDIR/frontend" && mv "$APPDIR/frontend-dist-tmp" "$APPDIR/frontend/dist"

# ROMs de QEMU (independientes de plataforma)
for rom in prebuilt/qemu_runtime/*.bin; do
  [ -f "$rom" ] && install -m 0644 "$rom" "$APPDIR/prebuilt/qemu_runtime/"
done
# Librerias QEMU nativas de Linux (opcionales)
if compgen -G "prebuilt/qemu_runtime_linux/*.so*" >/dev/null; then
  cp -a prebuilt/qemu_runtime_linux/*.so* "$APPDIR/prebuilt/qemu_runtime/"
else
  echo "[AVISO] prebuilt/qemu_runtime_linux/ no contiene libqemu-*.so: las placas ESP32 quedaran sin simulacion."
fi

install -m 0644 frontend/public/android-chrome-512.png "$STAGE/usr/share/pixmaps/mcu-maker.png"
install -m 0644 LICENSE "$STAGE/usr/share/doc/$PKG/copyright"
install -m 0644 README.md "$APPDIR/README.md"

# Lanzador: los datos de usuario (wifi_config.json, cache de compilacion) viven en
# ~/.local/share/mcu-maker porque /opt es de solo lectura para usuarios normales.
cat > "$STAGE/usr/bin/mcu-maker" <<'EOF'
#!/bin/sh
APP=/opt/mcu-maker
DATA="${XDG_DATA_HOME:-$HOME/.local/share}/mcu-maker"
mkdir -p "$DATA/artifacts"
ln -sfn "$APP/frontend" "$DATA/frontend"
cd "$DATA" || exit 1
exec "$APP/mcu-maker-launcher" "$@"
EOF
chmod 0755 "$STAGE/usr/bin/mcu-maker"

cat > "$STAGE/usr/share/applications/mcu-maker.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=MCU Maker
Comment=Plataforma abierta de simulación de microcontroladores
Exec=/usr/bin/mcu-maker
Icon=mcu-maker
Terminal=false
Categories=Development;Electronics;Education;
StartupWMClass=MCU Maker Launcher
EOF

cat > "$STAGE/DEBIAN/control" <<EOF
Package: $PKG
Version: $VERSION
Section: devel
Priority: optional
Architecture: $ARCH
Maintainer: Walther Curo De La Cruz
Depends: libc6 (>= 2.39), libssl3t64 | libssl3, libfdt1, libgl1, libx11-6, libxcursor1, libxrandr2, libxi6, libxkbcommon0, libxkbcommon-x11-0, libwayland-client0, xdg-utils
Homepage: http://localhost:8001
Description: MCU Maker - simulador de microcontroladores
 Plataforma abierta de simulación de microcontroladores (Arduino, Raspberry Pi
 Pico, ESP32) con backend 100% en Rust. Incluye el lanzador de escritorio, el
 servidor local y la interfaz web del simulador.
EOF

# ── 5. Construir .deb ─────────────────────────────────────────────────
echo "[5/5] Generando .deb..."
mkdir -p "$ROOT/dist-installer"
chmod 0755 "$STAGE" "$STAGE/DEBIAN"
chmod 0644 "$STAGE/DEBIAN/control"
dpkg-deb --root-owner-group --build "$STAGE" "$OUT" >/dev/null
rm -rf "$STAGE"

echo
echo "[OK] Instalador creado: $OUT"
echo "     Instalar:   sudo apt install \"$OUT\""
echo "     Desinstalar: sudo apt remove $PKG"
