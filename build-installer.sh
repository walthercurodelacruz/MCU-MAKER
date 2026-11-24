#!/usr/bin/env bash
#
# build-installer.sh - Construye el instalador oficial de MCU Maker para Ubuntu / Debian
# (Ubuntu 24.04 LTS+, Debian 12+): dist-installer/mcu-maker_<version>_amd64.deb
#
# Incluye binarios Rust, frontend SPA, Arduino CLI, librerías QEMU + 4 ROMs oficiales,
# pyserial embebido (prebuilt/python_libs), artefactos precompilados (prebuilt/artifacts)
# y script postinst que aprovisiona las plataformas de Arduino para que todo esté listo
# al primer uso.
#
# Uso:      ./build-installer.sh
# Instalar: sudo apt install ./dist-installer/mcu-maker_1.2.0_amd64.deb
#

set -euo pipefail

VERSION="1.2.0"
PKG="mcu-maker"
ARCH="amd64"
ARDUINO_CLI_VERSION="${ARDUINO_CLI_VERSION:-1.1.1}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

STAGE="${TMPDIR:-/tmp}/mcu-maker-stage-$$"
OUT="$ROOT/dist-installer/${PKG}_${VERSION}_${ARCH}.deb"
APPDIR="$STAGE/opt/$PKG"

echo "==================================================================="
echo "   MCU MAKER v${VERSION} - CREADOR DE INSTALADOR (.deb) UBUNTU/DEBIAN"
echo "==================================================================="

[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

need() { command -v "$1" >/dev/null 2>&1 || { echo "[ERROR] Falta '$1'. $2"; exit 1; }; }
need cargo    "Instale Rust: https://rustup.rs"
need npm      "Instale Node.js 20+: sudo apt install nodejs npm"
need dpkg-deb "Instale dpkg-dev: sudo apt install dpkg-dev (o sudo dnf install dpkg)"

# ── 1. Binarios Rust (release) ────────────────────────────────────────
echo "[1/5] Compilando suite Rust (release)..."
cargo build --manifest-path rust/Cargo.toml --release

# ── 2. Frontend ───────────────────────────────────────────────────────
echo "[2/5] Compilando interfaz web (frontend/dist)..."
if [ ! -f frontend/dist/index.html ]; then
  (cd frontend && npm install --legacy-peer-deps && npm run build:docker)
fi

# ── 3. Arduino CLI, pyserial y QEMU Runtime (Linux) ───────────────────
echo "[3/5] Preparando Arduino CLI, pyserial y QEMU Runtime para Linux..."
CLI_DIR="$ROOT/prebuilt/arduino-cli-linux"
if [ ! -x "$CLI_DIR/arduino-cli" ] \
   || [ ! -d "$ROOT/prebuilt/python_libs/serial" ] \
   || { [ ! -f "$ROOT/prebuilt/qemu_runtime_linux/libqemu-xtensa.so" ] && [ ! -f "$ROOT/prebuilt/qemu_runtime/libqemu-xtensa.so" ]; }; then
  "$ROOT/scripts/download-qemu-runtime.sh" --skip-cores || echo "[AVISO] No se pudieron descargar todos los componentes prebuilt automáticamente."
fi

# ── 4. Ensamblado del árbol del paquete ───────────────────────────────
echo "[4/5] Ensamblando paquete..."
rm -rf "$STAGE"
mkdir -p "$APPDIR/prebuilt/arduino-cli" \
         "$APPDIR/prebuilt/qemu_runtime/fw" \
         "$APPDIR/prebuilt/python_libs" \
         "$APPDIR/prebuilt/artifacts" \
         "$APPDIR/sdk" \
         "$STAGE/DEBIAN" "$STAGE/usr/bin" \
         "$STAGE/usr/share/applications" "$STAGE/usr/share/pixmaps" \
         "$STAGE/usr/share/doc/$PKG"

for b in mcu-maker-launcher mcu-maker-server mcu-maker-worker; do
  install -m 0755 "rust/target/release/$b" "$APPDIR/$b"
done
install -m 0755 "$CLI_DIR/arduino-cli" "$APPDIR/prebuilt/arduino-cli/arduino-cli"
cp -r frontend/dist "$APPDIR/frontend-dist-tmp" && mkdir -p "$APPDIR/frontend" && mv "$APPDIR/frontend-dist-tmp" "$APPDIR/frontend/dist"

if [ -d "sdk" ]; then
  cp -a sdk/* "$APPDIR/sdk/"
fi
if [ -d "prebuilt/python_libs" ]; then
  cp -a prebuilt/python_libs/* "$APPDIR/prebuilt/python_libs/"
fi
if [ -d "prebuilt/artifacts" ] && compgen -G "prebuilt/artifacts/*.json" >/dev/null; then
  cp -a prebuilt/artifacts/*.json "$APPDIR/prebuilt/artifacts/"
fi

# ROMs de QEMU (tanto en raíz de qemu_runtime como en fw/ para resolución directa -L)
for rom in prebuilt/qemu_runtime/*.bin; do
  if [ -f "$rom" ]; then
    install -m 0644 "$rom" "$APPDIR/prebuilt/qemu_runtime/"
    install -m 0644 "$rom" "$APPDIR/prebuilt/qemu_runtime/fw/"
  fi
done
if [ -d "prebuilt/qemu_runtime/fw" ]; then
  for rom in prebuilt/qemu_runtime/fw/*.bin; do
    if [ -f "$rom" ]; then
      install -m 0644 "$rom" "$APPDIR/prebuilt/qemu_runtime/"
      install -m 0644 "$rom" "$APPDIR/prebuilt/qemu_runtime/fw/"
    fi
  done
fi

# Librerías QEMU nativas de Linux
if compgen -G "prebuilt/qemu_runtime_linux/*.so*" >/dev/null; then
  cp -a prebuilt/qemu_runtime_linux/*.so* "$APPDIR/prebuilt/qemu_runtime/"
elif compgen -G "prebuilt/qemu_runtime/*.so*" >/dev/null; then
  cp -a prebuilt/qemu_runtime/*.so* "$APPDIR/prebuilt/qemu_runtime/"
else
  echo "[AVISO] No se encontraron libqemu-*.so: las placas ESP32 quedarán sin simulación."
fi

install -m 0644 frontend/public/android-chrome-512.png "$STAGE/usr/share/pixmaps/mcu-maker.png"
install -m 0644 LICENSE "$STAGE/usr/share/doc/$PKG/copyright"
install -m 0644 LICENSE "$APPDIR/LICENSE"
install -m 0644 README.md "$APPDIR/README.md"
[ -f MANUAL_PROYECTO_V1.md ] && install -m 0644 MANUAL_PROYECTO_V1.md "$APPDIR/MANUAL_PROYECTO_V1.md"

# Lanzador: los datos de usuario (wifi_config.json, caché de compilación) viven en
# ~/.local/share/mcu-maker porque /opt es de solo lectura para usuarios normales.
cat > "$STAGE/usr/bin/mcu-maker" <<'EOF'
#!/bin/sh
APP=/opt/mcu-maker
DATA="${XDG_DATA_HOME:-$HOME/.local/share}/mcu-maker"

export PATH="$APP:$APP/prebuilt/arduino-cli:$PATH"
export LD_LIBRARY_PATH="$APP/prebuilt/qemu_runtime:${LD_LIBRARY_PATH:-}"
export PYTHONPATH="$APP/prebuilt/python_libs:${PYTHONPATH:-}"

# Asegurar directorios de datos y enlaces simbólicos limpios
mkdir -p "$DATA/artifacts"
if [ -d "$APP/prebuilt/artifacts" ]; then
    for f in "$APP/prebuilt/artifacts/"*.json; do
        [ -f "$f" ] && cp -n "$f" "$DATA/artifacts/" 2>/dev/null || true
    done
fi
ln -sfn "$APP/frontend" "$DATA/frontend"
[ -d "$APP/prebuilt" ] && ln -sfn "$APP/prebuilt" "$DATA/prebuilt"
[ -d "$APP/sdk" ] && ln -sfn "$APP/sdk" "$DATA/sdk"
[ -f "$APP/README.md" ] && ln -sfn "$APP/README.md" "$DATA/README.md"
[ -f "$APP/MANUAL_PROYECTO_V1.md" ] && ln -sfn "$APP/MANUAL_PROYECTO_V1.md" "$DATA/MANUAL_PROYECTO_V1.md"

cd "$DATA" || exit 1

# Determinar si ejecutar servidor directo (modo headless o flags de servidor)
USE_SERVER=0
for arg in "$@"; do
    case "$arg" in
        --server|--headless|--port*|-p*)
            USE_SERVER=1
            ;;
    esac
done

if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
    USE_SERVER=1
fi

if [ "$USE_SERVER" -eq 1 ]; then
    ARGS=""
    for a in "$@"; do
        if [ "$a" != "--server" ] && [ "$a" != "--headless" ]; then
            ARGS="$ARGS \"$a\""
        fi
    done
    eval exec "\"$APP/mcu-maker-server\"" --dist "\"$APP/frontend/dist\"" $ARGS
else
    exec "$APP/mcu-maker-launcher" "$@"
fi
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
Maintainer: Walther Curo De La Cruz <curo.walther@gmail.com>
Depends: libc6 (>= 2.35), python3, python3-serial, libfdt1, libgcrypt20, zlib1g, libgl1, libx11-6, libxcursor1, libxrandr2, libxi6, libxkbcommon0, libxkbcommon-x11-0, libwayland-client0, xdg-utils
Homepage: https://github.com/walthercurodelacruz/MCU-MAKER
Description: MCU Maker - simulador de microcontroladores y circuitos
 Plataforma abierta de simulación de microcontroladores (Arduino AVR, Raspberry
 Pi Pico RP2040, ESP32/S3/C3 con QEMU) y motor analógico SPICE con backend 100%
 en Rust. Incluye el lanzador de escritorio, el servidor local y la interfaz web.
EOF

cat > "$STAGE/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e

CLI="/opt/mcu-maker/prebuilt/arduino-cli/arduino-cli"
URLS="https://espressif.github.io/arduino-esp32/package_esp32_index.json,https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json,http://drazzy.com/package_drazzy.com_index.json"

provision_user_cores() {
    TARGET_USER="$1"
    TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
    if [ -z "$TARGET_HOME" ] || [ ! -d "$TARGET_HOME" ] || [ ! -x "$CLI" ]; then
        return 0
    fi
    ARD_DIR="$TARGET_HOME/.arduino15"
    mkdir -p "$ARD_DIR"
    cat > "$ARD_DIR/arduino-cli.yaml" <<YAML
board_manager:
  additional_urls:
    - https://espressif.github.io/arduino-esp32/package_esp32_index.json
    - https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json
    - http://drazzy.com/package_drazzy.com_index.json
YAML
    chown -R "$TARGET_USER:$TARGET_USER" "$ARD_DIR" 2>/dev/null || true

    INSTALLED="$(su - "$TARGET_USER" -c "\"$CLI\" --config-file \"$ARD_DIR/arduino-cli.yaml\" core list" 2>/dev/null || true)"
    MISSING=0
    for cid in "arduino:avr" "ATTinyCore:avr" "esp32:esp32" "rp2040:rp2040"; do
        echo "$INSTALLED" | grep -q "$cid" || MISSING=1
    done
    if [ "$MISSING" -eq 1 ]; then
        echo "[MCU Maker] Preparando toolchains de Arduino para '$TARGET_USER' (listo al primer uso)..."
        su - "$TARGET_USER" -c "\"$CLI\" --config-file \"$ARD_DIR/arduino-cli.yaml\" core update-index --additional-urls \"$URLS\"" >/dev/null 2>&1 || true
        for spec in "arduino:avr" "ATTinyCore:avr" "esp32:esp32@2.0.17" "rp2040:rp2040"; do
            cid="${spec%@*}"
            if ! echo "$INSTALLED" | grep -q "$cid"; then
                echo "[MCU Maker] Instalando plataforma $spec..."
                su - "$TARGET_USER" -c "\"$CLI\" --config-file \"$ARD_DIR/arduino-cli.yaml\" core install \"$spec\" --additional-urls \"$URLS\"" || true
            fi
        done
    fi
}

if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    provision_user_cores "$SUDO_USER"
fi

exit 0
EOF
chmod 0755 "$STAGE/DEBIAN/postinst"

# ── 5. Construir .deb ─────────────────────────────────────────────────
echo "[5/5] Generando .deb..."
mkdir -p "$ROOT/dist-installer"
chmod 0755 "$STAGE" "$STAGE/DEBIAN"
chmod 0644 "$STAGE/DEBIAN/control"
dpkg-deb --root-owner-group --build "$STAGE" "$OUT" >/dev/null
rm -rf "$STAGE"

echo
echo "==================================================================="
echo "[OK] Instalador Debian/Ubuntu (.deb) creado exitosamente:"
echo "     $OUT"
echo "     Instalar:    sudo apt install \"$OUT\""
echo "     Desinstalar: sudo apt remove $PKG"
echo "==================================================================="
