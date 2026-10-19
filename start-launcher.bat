@echo off
setlocal enabledelayedexpansion
title MCU Maker Desktop Launcher (Rust Native)

echo ===================================================================
echo               MCU MAKER DESKTOP SUITE - NATIVE LAUNCHER
echo ===================================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

set "LAUNCHER_EXE=%SCRIPT_DIR%rust\target\debug\mcu-maker-launcher.exe"
set "SERVER_EXE=%SCRIPT_DIR%rust\target\debug\mcu-maker-server.exe"

if exist "%SCRIPT_DIR%rust\target\release\mcu-maker-launcher.exe" (
    set "LAUNCHER_EXE=%SCRIPT_DIR%rust\target\release\mcu-maker-launcher.exe"
)

if not exist "%LAUNCHER_EXE%" (
    echo [!] No se encontro el binario del Launcher en:
    echo     %LAUNCHER_EXE%
    echo.
    echo Intentando compilar el launcher en Rust...
    cd rust
    cargo build -p mcu-maker-launcher
    cd ..
    if not exist "%LAUNCHER_EXE%" (
        echo [ERROR] No se pudo compilar el launcher. Verifique la instalacion de Rust.
        pause
        exit /b 1
    )
)

echo [OK] Iniciando MCU Maker Desktop Launcher...
start "" "%LAUNCHER_EXE%"
exit /b 0
