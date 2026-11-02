#!/usr/bin/env bash
#
# build-appimage.sh - Empaqueta MCU Maker como un binario portable AppImage (x86_64)
# Todo-en-uno: incluye servidor Rust, lanzador gráfico, worker QEMU, Arduino CLI y frontend.
# No requiere permisos de root (sudo) para ejecutarse en ningún Linux.
#
# Uso: ./build-appimage.sh
#

set -euo pipefail

VERSION="1.0.0"
APP_NAME="MCU-Maker"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DIST_DIR="$ROOT/dist-installer"
APPDIR="$ROOT/build-appdir"
APPIMAGETOOL="$ROOT/prebuilt/appimagetool-x86_64.AppImage"

echo "==================================================================="
echo "        MCU MAKER - CREADOR DE PAQUETE PORTABLE (AppImage)"
echo "==================================================================="

need() { command -v "$1" >/dev/null 2>&1 || { echo "[ERROR] Falta '$1'. $2"; exit 1; }; }
need cargo "Instale Rust: https://rustup.rs"
need curl  "sudo apt install curl"

# 1. Compilación Release de Rust
echo "[1/5] Compilando suite Rust (release)..."
cargo build --manifest-path rust/Cargo.toml --release

# 2. Frontend
echo "[2/5] Verificando compilación frontend (dist)..."
if [ ! -f frontend/dist/index.html ]; then
  (cd frontend && npm install --legacy-peer-deps && npm run build:docker)
fi

# 3. Preparar AppDir
echo "[3/5] Ensamblando AppDir..."
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin" \
         "$APPDIR/usr/lib" \
         "$APPDIR/usr/share/mcu-maker/frontend" \
         "$APPDIR/usr/share/mcu-maker/prebuilt/arduino-cli" \
         "$APPDIR/usr/share/mcu-maker/prebuilt/qemu_runtime" \
         "$APPDIR/usr/share/applications" \
         "$APPDIR/usr/share/icons/hicolor/512x512/apps"

# Copiar binarios compilados
for b in mcu-maker-launcher mcu-maker-server mcu-maker-worker; do
  install -m 0755 "rust/target/release/$b" "$APPDIR/usr/bin/$b"
done

# Copiar frontend
cp -r frontend/dist "$APPDIR/usr/share/mcu-maker/frontend/dist"

# Copiar Arduino CLI
if [ -f "prebuilt/arduino-cli-linux/arduino-cli" ]; then
  install -m 0755 "prebuilt/arduino-cli-linux/arduino-cli" "$APPDIR/usr/share/mcu-maker/prebuilt/arduino-cli/arduino-cli"
elif [ -f "prebuilt/arduino-cli/arduino-cli" ]; then
  install -m 0755 "prebuilt/arduino-cli/arduino-cli" "$APPDIR/usr/share/mcu-maker/prebuilt/arduino-cli/arduino-cli"
fi

# Copiar QEMU Runtime (ROMs y librerías .so)
for rom in prebuilt/qemu_runtime/*.bin; do
  [ -f "$rom" ] && install -m 0644 "$rom" "$APPDIR/usr/share/mcu-maker/prebuilt/qemu_runtime/"
done
if [ -d "prebuilt/qemu_runtime/fw" ]; then
  cp -r prebuilt/qemu_runtime/fw "$APPDIR/usr/share/mcu-maker/prebuilt/qemu_runtime/"
fi
if compgen -G "prebuilt/qemu_runtime_linux/*.so*" >/dev/null; then
  cp -a prebuilt/qemu_runtime_linux/*.so* "$APPDIR/usr/share/mcu-maker/prebuilt/qemu_runtime/"
  cp -a prebuilt/qemu_runtime_linux/*.so* "$APPDIR/usr/lib/"
elif compgen -G "prebuilt/qemu_runtime/*.so*" >/dev/null; then
  cp -a prebuilt/qemu_runtime/*.so* "$APPDIR/usr/share/mcu-maker/prebuilt/qemu_runtime/"
  cp -a prebuilt/qemu_runtime/*.so* "$APPDIR/usr/lib/"
fi

# Icono y .desktop
install -m 0644 frontend/public/android-chrome-512.png "$APPDIR/mcu-maker.png"
install -m 0644 frontend/public/android-chrome-512.png "$APPDIR/usr/share/icons/hicolor/512x512/apps/mcu-maker.png"

cat > "$APPDIR/mcu-maker.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=MCU Maker
Comment=Plataforma abierta de simulación de microcontroladores
Exec=AppRun
Icon=mcu-maker
Terminal=false
Categories=Development;Electronics;Education;
StartupWMClass=MCU Maker Launcher
EOF

# AppRun: script ejecutable de entrada
cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/sh
SELF=$(readlink -f "$0")
APPDIR=$(dirname "$SELF")

export PATH="$APPDIR/usr/bin:$APPDIR/usr/share/mcu-maker/prebuilt/arduino-cli:$PATH"
export LD_LIBRARY_PATH="$APPDIR/usr/lib:$APPDIR/usr/share/mcu-maker/prebuilt/qemu_runtime:${LD_LIBRARY_PATH:-}"

DATA="${XDG_DATA_HOME:-$HOME/.local/share}/mcu-maker"
mkdir -p "$DATA/artifacts"
ln -sfn "$APPDIR/usr/share/mcu-maker/frontend" "$DATA/frontend"
ln -sfn "$APPDIR/usr/share/mcu-maker/prebuilt" "$DATA/prebuilt"

cd "$DATA" || exit 1

USE_SERVER=0
for arg in "$@"; do
    case "$arg" in
        --server|--headless|--port*|-p*)
            USE_SERVER=1
            ;;
    esac
done

if [ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ]; then
    USE_SERVER=1
fi

if [ "$USE_SERVER" -eq 1 ]; then
    ARGS=""
    for a in "$@"; do
        if [ "$a" != "--server" ] && [ "$a" != "--headless" ]; then
            ARGS="$ARGS \"$a\""
        fi
    done
    eval exec "\"$APPDIR/usr/bin/mcu-maker-server\"" --dist "\"$APPDIR/usr/share/mcu-maker/frontend/dist\"" $ARGS
else
    exec "$APPDIR/usr/bin/mcu-maker-launcher" "$@"
fi
EOF
chmod 0755 "$APPDIR/AppRun"

# 4. Descargar appimagetool si no existe
echo "[4/5] Verificando herramienta appimagetool..."
mkdir -p "$ROOT/prebuilt"
if [ ! -x "$APPIMAGETOOL" ]; then
  echo "Descargando appimagetool..."
  curl -fsSL -o "$APPIMAGETOOL" "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
  chmod +x "$APPIMAGETOOL"
fi

# 5. Generar AppImage
echo "[5/5] Empaquetando AppImage..."
mkdir -p "$DIST_DIR"
OUT="$DIST_DIR/${APP_NAME}-${VERSION}-x86_64.AppImage"
rm -f "$OUT"

export ARCH="x86_64"
if ! "$APPIMAGETOOL" "$APPDIR" "$OUT" 2>/dev/null; then
  # Fallback si FUSE no está disponible en el entorno del host
  "$APPIMAGETOOL" --appimage-extract-and-run "$APPDIR" "$OUT"
fi

chmod +x "$OUT"
rm -rf "$APPDIR"

echo
echo "==================================================================="
echo "[OK] AppImage generado exitosamente:"
echo "     $OUT"
echo "     Ejecutar: chmod +x \"$OUT\" && \"$OUT\""
echo "==================================================================="
