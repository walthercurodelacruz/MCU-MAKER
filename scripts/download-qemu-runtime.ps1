<#
.SYNOPSIS
  Descarga el runtime QEMU para Windows (libqemu-xtensa.dll, libqemu-riscv32.dll,
  dependencias MinGW, ROMs y esp32s3_rev0_rom.bin) y arduino-cli.exe.
#>
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$PicSimLabVer = "0.9.3"
$PicSimLabUrl = "https://github.com/lcgamboa/picsimlab/releases/download/v${PicSimLabVer}/PICSimLab_${PicSimLabVer}_260920_win64.zip"
$EspressifQemuUrl = "https://github.com/espressif/qemu/releases/download/esp-develop-9.2.2-20260417/qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-x86_64-w64-mingw32.tar.xz"
$ArduinoCliVer = if ($env:ARDUINO_CLI_VERSION) { $env:ARDUINO_CLI_VERSION } else { "1.1.1" }
$ArduinoCliUrl = "https://github.com/arduino/arduino-cli/releases/download/v${ArduinoCliVer}/arduino-cli_${ArduinoCliVer}_Windows_64bit.zip"

$TargetRuntime = Join-Path $Root "prebuilt\qemu_runtime"
$TargetCli = Join-Path $Root "prebuilt\arduino-cli"
New-Item -ItemType Directory -Force -Path $TargetRuntime | Out-Null
New-Item -ItemType Directory -Force -Path $TargetCli | Out-Null

$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("mcu-maker-win-runtime-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

try {
  Write-Host "===================================================================" -ForegroundColor Cyan
  Write-Host "     MCU MAKER - DESCARGADOR DE QEMU RUNTIME Y CLI (WINDOWS)" -ForegroundColor Cyan
  Write-Host "===================================================================" -ForegroundColor Cyan

  # 1. Arduino CLI
  $CliExe = Join-Path $TargetCli "arduino-cli.exe"
  if (-not (Test-Path $CliExe)) {
    Write-Host "--> Descargando Arduino CLI v${ArduinoCliVer} para Windows x64..."
    $CliZip = Join-Path $TmpDir "arduino-cli.zip"
    & curl.exe -fsSL -o $CliZip $ArduinoCliUrl
    Expand-Archive -Path $CliZip -DestinationPath $TargetCli -Force
  } else {
    Write-Host "--> Arduino CLI ya presente en $CliExe"
  }

  # 2. PICSimLab Windows 64-bit QEMU DLLs
  $XtensaDll = Join-Path $TargetRuntime "libqemu-xtensa.dll"
  if (-not (Test-Path $XtensaDll)) {
    Write-Host "--> Descargando paquete oficial PICSimLab v${PicSimLabVer} (win64)..."
    $PicZip = Join-Path $TmpDir "picsimlab_win64.zip"
    & curl.exe -fsSL -o $PicZip $PicSimLabUrl
    $ExtractDir = Join-Path $TmpDir "extracted"
    Expand-Archive -Path $PicZip -DestinationPath $ExtractDir -Force

    # Buscar directorio que contiene libqemu-xtensa.dll y sibling MinGW DLLs
    $FoundXtensa = Get-ChildItem -Path $ExtractDir -Recurse -Filter "libqemu-xtensa.dll" | Select-Object -First 1
    if (-not $FoundXtensa) {
      throw "No se encontro libqemu-xtensa.dll dentro del paquete PICSimLab win64"
    }
    $QemuDir = $FoundXtensa.Directory.FullName
    $RootBinDir = $FoundXtensa.Directory.Parent.Parent.FullName

    # Copiar todas las DLLs de lib/qemu, las ROMs de fw/*.bin junto a las DLLs y las DLLs base de MinGW necesarias
    Copy-Item -Path (Join-Path $QemuDir "*") -Destination $TargetRuntime -Recurse -Force
    $ExtractedFwDir = Join-Path $QemuDir "fw"
    if (Test-Path $ExtractedFwDir) {
      Get-ChildItem -Path $ExtractedFwDir -Filter "*.bin" -File | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination (Join-Path $TargetRuntime $_.Name) -Force
      }
    }
    if (Test-Path $RootBinDir) {
      Get-ChildItem -Path $RootBinDir -Filter "*.dll" -File | ForEach-Object {
        $DestFile = Join-Path $TargetRuntime $_.Name
        if (-not (Test-Path $DestFile)) {
          Copy-Item -Path $_.FullName -Destination $DestFile -Force
        }
      }
    }
  } else {
    Write-Host "--> Librerias QEMU ya presentes en $TargetRuntime"
    # Asegurar que cualquier ROM presente en fw/ tambien exista junto a las DLLs (-L dir)
    $ExistingFwDir = Join-Path $TargetRuntime "fw"
    if (Test-Path $ExistingFwDir) {
      Get-ChildItem -Path $ExistingFwDir -Filter "*.bin" -File | ForEach-Object {
        $DestRom = Join-Path $TargetRuntime $_.Name
        if (-not (Test-Path $DestRom)) {
          Copy-Item -Path $_.FullName -Destination $DestRom -Force
        }
      }
    }
  }

  # 3. esp32s3_rev0_rom.bin de Espressif QEMU
  $S3Rom = Join-Path $TargetRuntime "esp32s3_rev0_rom.bin"
  if (-not (Test-Path $S3Rom)) {
    Write-Host "--> Descargando esp32s3_rev0_rom.bin oficial de Espressif..."
    $EspTar = Join-Path $TmpDir "espressif-qemu.tar.xz"
    & curl.exe -fsSL -o $EspTar $EspressifQemuUrl
    & tar.exe -xJf $EspTar --strip-components=3 -C $TargetRuntime qemu/share/qemu/esp32s3_rev0_rom.bin
    $FwDir = Join-Path $TargetRuntime "fw"
    New-Item -ItemType Directory -Force -Path $FwDir | Out-Null
    Copy-Item -Path $S3Rom -Destination (Join-Path $FwDir "esp32s3_rev0_rom.bin") -Force
  } else {
    Write-Host "--> esp32s3_rev0_rom.bin ya presente en $S3Rom"
  }

  Write-Host "`n[OK] Runtime QEMU y Arduino CLI para Windows instalados en:" -ForegroundColor Green
  Write-Host "     - $TargetRuntime"
  Write-Host "     - $TargetCli"
} finally {
  Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
