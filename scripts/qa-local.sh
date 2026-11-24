#!/usr/bin/env bash
#
# qa-local.sh - Suite integral de QA local para MCU Maker (sin GitHub Actions).
# Uso: ./scripts/qa-local.sh [--install] [--include-ignored] [--offline] [--strict]
#

set -u

INSTALL=0
INCLUDE_IGNORED=0
OFFLINE=0
STRICT=0
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    --include-ignored) INCLUDE_IGNORED=1 ;;
    --offline) OFFLINE=1 ;;
    --strict) STRICT=1 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=()

run_step() {
  local name="$1"
  shift
  echo ""
  echo "============================================================"
  echo " [QA] $name"
  echo "============================================================"
  if "$@"; then
    echo " [OK] $name"
  else
    echo " [FAIL] $name"
    FAILURES+=("$name")
  fi
}

CARGO_FLAGS=()
[ "$OFFLINE" -eq 1 ] && CARGO_FLAGS+=(--offline)

# 1. Rust Workspace
run_step "Rust: cargo check --workspace" bash -c "cd '$ROOT/rust' && cargo check --workspace ${CARGO_FLAGS[*]:-}"
run_step "Rust: cargo clippy --workspace --all-targets -- -D warnings" bash -c "cd '$ROOT/rust' && cargo clippy --workspace --all-targets ${CARGO_FLAGS[*]:-} -- -D warnings"
run_step "Rust: cargo test --workspace" bash -c "cd '$ROOT/rust' && cargo test --workspace ${CARGO_FLAGS[*]:-}"
if [ "$INCLUDE_IGNORED" -eq 1 ]; then
  run_step "Rust: cargo test --workspace -- --ignored" bash -c "cd '$ROOT/rust' && cargo test --workspace ${CARGO_FLAGS[*]:-} -- --ignored"
fi

# 2. Frontend
if [ "$INSTALL" -eq 1 ] && [ ! -d "$ROOT/frontend/node_modules" ]; then
  run_step "Frontend: npm install" bash -c "cd '$ROOT/frontend' && npm install --legacy-peer-deps"
fi
if [ -d "$ROOT/frontend/node_modules" ]; then
  if [ "$STRICT" -eq 1 ]; then
    run_step "Frontend [Strict]: TypeScript (tsc -b)" bash -c "cd '$ROOT/frontend' && npm run tsc"
    run_step "Frontend [Strict]: Lint & Prettier (npm run check)" bash -c "cd '$ROOT/frontend' && npm run check"
    run_step "Frontend [Strict]: Vitest suite completa" bash -c "cd '$ROOT/frontend' && npm test"
  else
    run_step "Frontend: Vitest placas canonicas y contratos API" bash -c "cd '$ROOT/frontend' && npx vitest run \
      src/__tests__/services-api-contract.test.ts \
      src/__tests__/canonical-16-boards.test.ts \
      src/__tests__/board-kinds-coverage.test.ts \
      src/__tests__/board-pin-mapping.test.ts \
      src/__tests__/esp32-adc-channel-map.test.ts \
      src/__tests__/esp32-element-onboard-led.test.ts \
      src/__tests__/issue-122-micropython-esp32.test.ts \
      src/__tests__/issue-139-espidf-mode.test.ts \
      src/__tests__/onboard-leds-attach.test.ts \
      src/__tests__/onboard-led-table.test.ts \
      src/__tests__/board-on-canvas-onboard-led.test.ts"
  fi
  run_step "Frontend: Vite production build (build:docker)" bash -c "cd '$ROOT/frontend' && npm run build:docker"
else
  FAILURES+=("Frontend: falta node_modules (usa --install o 'cd frontend && npm install --legacy-peer-deps')")
fi

# 3. Circuit Sandbox
if [ "$INSTALL" -eq 1 ] && [ ! -d "$ROOT/test/test_circuit/node_modules" ]; then
  run_step "Circuit Sandbox: npm install" bash -c "cd '$ROOT/test/test_circuit' && npm install"
fi
if [ -d "$ROOT/test/test_circuit/node_modules" ]; then
  run_step "Circuit Sandbox: Vitest suite" bash -c "cd '$ROOT/test/test_circuit' && npm test"
else
  FAILURES+=("Circuit Sandbox: falta node_modules en test/test_circuit")
fi

# 4. VS Code Extension
if [ "$INSTALL" -eq 1 ] && [ ! -d "$ROOT/vscode-extension/node_modules" ]; then
  run_step "VS Code Extension: npm install" bash -c "cd '$ROOT/vscode-extension' && npm install"
fi
if [ -d "$ROOT/vscode-extension/node_modules" ]; then
  run_step "VS Code Extension: TypeScript check" bash -c "cd '$ROOT/vscode-extension' && ./node_modules/.bin/tsc --noEmit"
  run_step "VS Code Extension: build:extension" bash -c "cd '$ROOT/vscode-extension' && npm run build:extension"
else
  FAILURES+=("VS Code Extension: falta node_modules en vscode-extension")
fi

echo ""
echo "============================================================"
if [ "${#FAILURES[@]}" -eq 0 ]; then
  echo " [QA RESULTADO] TODAS LAS VERIFICACIONES LOCALES PASARON"
  exit 0
else
  echo " [QA RESULTADO] FALLOS / PENDIENTES (${#FAILURES[@]}):"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
