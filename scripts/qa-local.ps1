<#
.SYNOPSIS
  Suite integral de QA local para MCU Maker (sin GitHub Actions).
.DESCRIPTION
  Ejecuta validaciones y pruebas locales para:
    1. Rust workspace (clippy -D warnings + cargo test --workspace)
    2. Frontend (11 suites canonicas + contratos API + vite build)
    3. Sandbox de circuitos (test/test_circuit: 32 archivos Vitest)
    4. Extension de VS Code (tsc --noEmit + esbuild)
.PARAMETER Install
  Instala dependencias npm faltantes (--legacy-peer-deps) antes de ejecutar pruebas.
.PARAMETER IncludeIgnored
  Incluye pruebas de integracion Rust marcadas con #[ignore] (requieren QEMU y arduino-cli).
.PARAMETER Offline
  Pasa --offline a Cargo.
.PARAMETER Strict
  Incluye auditoria completa de frontend (tsc -b, eslint, prettier y los 363 archivos Vitest,
  incluyendo tests heredados del backend Python eliminado).
#>
param(
  [switch]$Install,
  [switch]$IncludeIgnored,
  [switch]$Offline,
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Failures = New-Object System.Collections.Generic.List[string]

function Run-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )
  Write-Host "`n============================================================" -ForegroundColor Cyan
  Write-Host " [QA] $Name" -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor Cyan
  try {
    & $Action
    if ($LASTEXITCODE -ne 0) {
      throw "Comando finalizo con codigo $LASTEXITCODE"
    }
    Write-Host " [OK] $Name" -ForegroundColor Green
  } catch {
    Write-Host " [FAIL] $Name : $_" -ForegroundColor Red
    $Failures.Add($Name)
  }
}

$CargoFlags = @()
if ($Offline) { $CargoFlags += "--offline" }

# 1. Rust Workspace
Run-Step "Rust: cargo check --workspace" {
  Push-Location (Join-Path $Root "rust")
  try { & cargo check --workspace @CargoFlags } finally { Pop-Location }
}

Run-Step "Rust: cargo clippy --workspace --all-targets -- -D warnings" {
  Push-Location (Join-Path $Root "rust")
  try { & cargo clippy --workspace --all-targets @CargoFlags -- -D warnings } finally { Pop-Location }
}

Run-Step "Rust: cargo test --workspace" {
  Push-Location (Join-Path $Root "rust")
  try {
    & cargo test --workspace @CargoFlags
    if ($LASTEXITCODE -eq 0 -and $IncludeIgnored) {
      & cargo test --workspace @CargoFlags -- --ignored
    }
  } finally { Pop-Location }
}

# 2. Frontend
$FrontendDir = Join-Path $Root "frontend"
if ($Install -and -not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
  Run-Step "Frontend: npm install" {
    Push-Location $FrontendDir
    try { & npm.cmd install --legacy-peer-deps } finally { Pop-Location }
  }
}

if (Test-Path (Join-Path $FrontendDir "node_modules")) {
  if ($Strict) {
    Run-Step "Frontend [Strict]: TypeScript (tsc -b)" {
      Push-Location $FrontendDir
      try { & npm.cmd run tsc } finally { Pop-Location }
    }
    Run-Step "Frontend [Strict]: Lint & Prettier (npm run check)" {
      Push-Location $FrontendDir
      try { & npm.cmd run check } finally { Pop-Location }
    }
    Run-Step "Frontend [Strict]: Vitest suite completa" {
      Push-Location $FrontendDir
      try { & npm.cmd test } finally { Pop-Location }
    }
  } else {
    Run-Step "Frontend: Vitest placas canonicas y contratos API" {
      Push-Location $FrontendDir
      try {
        & node .\node_modules\vitest\vitest.mjs run `
          src/__tests__/services-api-contract.test.ts `
          src/__tests__/canonical-16-boards.test.ts `
          src/__tests__/board-kinds-coverage.test.ts `
          src/__tests__/board-pin-mapping.test.ts `
          src/__tests__/esp32-adc-channel-map.test.ts `
          src/__tests__/esp32-element-onboard-led.test.ts `
          src/__tests__/issue-122-micropython-esp32.test.ts `
          src/__tests__/issue-139-espidf-mode.test.ts `
          src/__tests__/onboard-leds-attach.test.ts `
          src/__tests__/onboard-led-table.test.ts `
          src/__tests__/board-on-canvas-onboard-led.test.ts
      } finally { Pop-Location }
    }
  }

  Run-Step "Frontend: Vite production build (build:docker)" {
    Push-Location $FrontendDir
    try { & npm.cmd run build:docker } finally { Pop-Location }
  }
} else {
  $Failures.Add("Frontend: node_modules no encontrado (ejecuta con -Install o 'npm install --legacy-peer-deps' en frontend/)")
}

# 3. Sandbox test_circuit
$CircuitDir = Join-Path $Root "test\test_circuit"
if ($Install -and -not (Test-Path (Join-Path $CircuitDir "node_modules"))) {
  Run-Step "Circuit Sandbox: npm install" {
    Push-Location $CircuitDir
    try { & npm.cmd install } finally { Pop-Location }
  }
}

if (Test-Path (Join-Path $CircuitDir "node_modules")) {
  Run-Step "Circuit Sandbox: Vitest suite (test/test_circuit)" {
    Push-Location $CircuitDir
    try { & npm.cmd test } finally { Pop-Location }
  }
} else {
  $Failures.Add("Circuit Sandbox: node_modules no encontrado en test/test_circuit")
}

# 4. VS Code Extension
$ExtDir = Join-Path $Root "vscode-extension"
if ($Install -and -not (Test-Path (Join-Path $ExtDir "node_modules"))) {
  Run-Step "VS Code Extension: npm install" {
    Push-Location $ExtDir
    try { & npm.cmd install } finally { Pop-Location }
  }
}

if (Test-Path (Join-Path $ExtDir "node_modules")) {
  Run-Step "VS Code Extension: TypeScript check (tsc --noEmit)" {
    Push-Location $ExtDir
    try { & node .\node_modules\typescript\bin\tsc --noEmit } finally { Pop-Location }
  }
  Run-Step "VS Code Extension: Bundle (build:extension)" {
    Push-Location $ExtDir
    try { & npm.cmd run build:extension } finally { Pop-Location }
  }
} else {
  $Failures.Add("VS Code Extension: node_modules no encontrado en vscode-extension/")
}

Write-Host "`n============================================================" -ForegroundColor Yellow
if ($Failures.Count -eq 0) {
  Write-Host " [QA RESULTADO] TODAS LAS VERIFICACIONES LOCALES PASARON" -ForegroundColor Green
  exit 0
} else {
  Write-Host " [QA RESULTADO] FALLOS / PENDIENTES ($($Failures.Count)):" -ForegroundColor Red
  foreach ($f in $Failures) {
    Write-Host "  - $f" -ForegroundColor Red
  }
  exit 1
}
