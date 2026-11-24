#!/usr/bin/env bash
#
# build-rpm.sh - Construye el instalador oficial de MCU Maker para distribuciones
# basadas en RPM (Fedora 39+, RHEL / Rocky / AlmaLinux 9+, openSUSE):
#   dist-installer/mcu-maker-<version>-1.x86_64.rpm
#
# Incluye binarios Rust, frontend SPA, Arduino CLI, librerías QEMU + 4 ROMs oficiales,
# pyserial embebido (prebuilt/python_libs), artefactos precompilados (prebuilt/artifacts)
# y script %post que aprovisiona las plataformas de Arduino para que todo esté listo
# al primer uso.
#
# Uso:      ./build-rpm.sh
# Instalar: sudo dnf install ./dist-installer/mcu-maker-1.2.0-1.x86_64.rpm
#

set -euo pipefail

VERSION="1.2.0"
RELEASE="1"
PKG="mcu-maker"
ARCH="x86_64"
ARDUINO_CLI_VERSION="${ARDUINO_CLI_VERSION:-1.1.1}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

RPM_TOPDIR="${TMPDIR:-/tmp}/mcu-maker-rpmbuild-$$"
OUT="$ROOT/dist-installer/${PKG}-${VERSION}-${RELEASE}.${ARCH}.rpm"

echo "==================================================================="
echo "  MCU MAKER v${VERSION} - CREADOR DE INSTALADOR (.rpm) FEDORA/RHEL"
echo "==================================================================="

[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

need() { command -v "$1" >/dev/null 2>&1 || { echo "[ERROR] Falta '$1'. $2"; exit 1; }; }
need cargo    "Instale Rust: https://rustup.rs"
need npm      "Instale Node.js 20+: sudo dnf install nodejs npm"
need rpmbuild "Instale rpm-build: sudo dnf install rpm-build (o sudo apt install rpm)"

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

# ── 4. Preparar árbol RPMBUILD y archivo .spec ────────────────────────
echo "[4/5] Ensamblando estructura RPM..."
rm -rf "$RPM_TOPDIR"
mkdir -p "$RPM_TOPDIR"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}

STAGE="$RPM_TOPDIR/STAGE"
APPDIR="$STAGE/opt/$PKG"
mkdir -p "$APPDIR/prebuilt/arduino-cli" \
         "$APPDIR/prebuilt/qemu_runtime/fw" \
         "$APPDIR/prebuilt/python_libs" \
         "$APPDIR/prebuilt/artifacts" \
         "$APPDIR/sdk" \
         "$STAGE/usr/bin" \
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
chmod 0755 "$APPDIR/prebuilt/qemu_runtime/"*.so* 2>/dev/null || true

install -m 0644 frontend/public/android-chrome-512.png "$STAGE/usr/share/pixmaps/mcu-maker.png"
install -m 0644 LICENSE "$STAGE/usr/share/doc/$PKG/copyright"
install -m 0644 LICENSE "$APPDIR/LICENSE"
install -m 0644 README.md "$APPDIR/README.md"
[ -f MANUAL_PROYECTO_V1.md ] && install -m 0644 MANUAL_PROYECTO_V1.md "$APPDIR/MANUAL_PROYECTO_V1.md"

cat > "$STAGE/usr/bin/mcu-maker" <<'EOF'
#!/bin/sh
APP=/opt/mcu-maker
DATA="${XDG_DATA_HOME:-$HOME/.local/share}/mcu-maker"

export PATH="$APP:$APP/prebuilt/arduino-cli:$PATH"
export LD_LIBRARY_PATH="$APP/prebuilt/qemu_runtime:${LD_LIBRARY_PATH:-}"
export PYTHONPATH="$APP/prebuilt/python_libs:${PYTHONPATH:-}"

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

cat > "$RPM_TOPDIR/SPECS/$PKG.spec" <<EOF
%global _build_id_links none
%global __strip /bin/true
%global debug_package %{nil}

Name:           $PKG
Version:        $VERSION
Release:        ${RELEASE}
Summary:        MCU Maker - Plataforma abierta de simulación de microcontroladores y circuitos
License:        AGPL-3.0-only
URL:            https://github.com/walthercurodelacruz/MCU-MAKER
BuildArch:      $ARCH
AutoReqProv:    no
Requires:       glibc, python3, python3-pyserial, libfdt, libgcrypt, zlib, libGL, libX11, libXcursor, libXrandr, libXi, libxkbcommon, libxkbcommon-x11, libwayland-client, xdg-utils

%description
Plataforma abierta de simulación de microcontroladores (Arduino AVR, Raspberry
Pi Pico RP2040, ESP32/S3/C3 con QEMU) y motor analógico SPICE con backend 100%
en Rust. Incluye el lanzador de escritorio, el servidor local y la interfaz web.
Desarrollado por Walther Curo De La Cruz.

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}
cp -a "$STAGE/"* %{buildroot}/

%post
CLI="/opt/mcu-maker/prebuilt/arduino-cli/arduino-cli"
URLS="https://espressif.github.io/arduino-esp32/package_esp32_index.json,https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json,http://drazzy.com/package_drazzy.com_index.json"
if [ -n "\${SUDO_USER:-}" ] && [ "\$SUDO_USER" != "root" ] && [ -x "\$CLI" ]; then
    TARGET_HOME="\$(getent passwd "\$SUDO_USER" | cut -d: -f6)"
    if [ -n "\$TARGET_HOME" ] && [ -d "\$TARGET_HOME" ]; then
        ARD_DIR="\$TARGET_HOME/.arduino15"
        mkdir -p "\$ARD_DIR"
        cat > "\$ARD_DIR/arduino-cli.yaml" <<YAML
board_manager:
  additional_urls:
    - https://espressif.github.io/arduino-esp32/package_esp32_index.json
    - https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json
    - http://drazzy.com/package_drazzy.com_index.json
YAML
        chown -R "\$SUDO_USER:\$SUDO_USER" "\$ARD_DIR" 2>/dev/null || true
        INSTALLED="\$(su - "\$SUDO_USER" -c "\"\$CLI\" --config-file \"\$ARD_DIR/arduino-cli.yaml\" core list" 2>/dev/null || true)"
        MISSING=0
        for cid in "arduino:avr" "ATTinyCore:avr" "esp32:esp32" "rp2040:rp2040"; do
            echo "\$INSTALLED" | grep -q "\$cid" || MISSING=1
        done
        if [ "\$MISSING" -eq 1 ]; then
            echo "[MCU Maker] Preparando toolchains de Arduino para '\$SUDO_USER' (listo al primer uso)..."
            su - "\$SUDO_USER" -c "\"\$CLI\" --config-file \"\$ARD_DIR/arduino-cli.yaml\" core update-index --additional-urls \"\$URLS\"" >/dev/null 2>&1 || true
            for spec in "arduino:avr" "ATTinyCore:avr" "esp32:esp32@2.0.17" "rp2040:rp2040"; do
                cid="\${spec%@*}"
                if ! echo "\$INSTALLED" | grep -q "\$cid"; then
                    echo "[MCU Maker] Instalando plataforma \$spec..."
                    su - "\$SUDO_USER" -c "\"\$CLI\" --config-file \"\$ARD_DIR/arduino-cli.yaml\" core install \"\$spec\" --additional-urls \"\$URLS\"" || true
                fi
            done
        fi
    fi
fi
exit 0

%files
/opt/$PKG
/usr/bin/mcu-maker
/usr/share/applications/mcu-maker.desktop
/usr/share/pixmaps/mcu-maker.png
/usr/share/doc/$PKG
EOF

# ── 5. Construir .rpm ─────────────────────────────────────────────────
echo "[5/5] Generando .rpm con rpmbuild..."
mkdir -p "$ROOT/dist-installer"
rpmbuild --define "_topdir $RPM_TOPDIR" --define "_binary_payload w2.xzdio" -bb "$RPM_TOPDIR/SPECS/$PKG.spec" >/dev/null
BUILT_RPM="$(find "$RPM_TOPDIR/RPMS" -name "*.rpm" | head -n 1)"
if [ -z "$BUILT_RPM" ] || [ ! -f "$BUILT_RPM" ]; then
  echo "[ERROR] No se encontró el archivo .rpm generado."
  rm -rf "$RPM_TOPDIR"
  exit 1
fi
cp -f "$BUILT_RPM" "$OUT"
rm -rf "$RPM_TOPDIR"

echo
echo "==================================================================="
echo "[OK] Instalador Fedora/RHEL/openSUSE (.rpm) creado exitosamente:"
echo "     $OUT"
echo "     Instalar (Fedora/RHEL): sudo dnf install \"$OUT\""
echo "     Instalar (openSUSE):    sudo zypper install \"$OUT\""
echo "     Desinstalar:            sudo dnf remove $PKG"
echo "==================================================================="
