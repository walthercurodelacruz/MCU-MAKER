@echo off
setlocal enabledelayedexpansion
title Creador de Instalador de Windows - MCU Maker

echo ===================================================================
echo             CREADOR DE INSTALADOR OFICIAL MCU MAKER (WINDOWS)
echo ===================================================================
echo/

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: 1. Buscar compilador Inno Setup (ISCC.exe)
set "ISCC="
if exist "%LocalAppData%\Programs\Inno Setup 6\ISCC.exe" set "ISCC=%LocalAppData%\Programs\Inno Setup 6\ISCC.exe"
if "%ISCC%"=="" if exist "C:\Program Files\Inno Setup 6\ISCC.exe" set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
if "%ISCC%"=="" if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if "%ISCC%"=="" for /f "delims=" %%I in ('where iscc 2^>nul') do set "ISCC=%%I"

if "%ISCC%"=="" (
    echo [ERROR] No se encontro Inno Setup [ISCC.exe].
    echo Por favor instale Inno Setup 6 ejecutando:
    echo     winget install JRSoftware.InnoSetup --silent
    echo/
    pause
    exit /b 1
)

echo [OK] Compilador Inno Setup encontrado en:
echo      "%ISCC%"
echo/

:: 2. Verificar binarios Rust compilados
echo [1/3] Verificando binarios nativos de Rust (Release)...
if not exist "rust\target\release\mcu-maker-launcher.exe" (
    echo Compilando suite Rust en modo release...
    cargo build --manifest-path "rust\Cargo.toml" --release
)

:: 3. Verificar frontend precompilado
echo [2/3] Verificando compilacion de interfaz web (frontend\dist)...
if not exist "frontend\dist\index.html" (
    echo Compilando frontend...
    pushd "%SCRIPT_DIR%frontend"
    call npm.cmd run build:docker
    popd
)

:: 4. Compilar instalador
echo [3/3] Compilando instalador de Windows (Inno Setup)...
if not exist "dist-installer" mkdir "dist-installer"

"%ISCC%" "installer.iss"
if errorlevel 1 (
    echo/
    echo [ERROR] Fallo la compilacion del instalador.
    pause
    exit /b 1
)

echo/
echo ===================================================================
echo  [EXITO] Instalador generado exitosamente en:
echo  %SCRIPT_DIR%dist-installer\
echo ===================================================================
echo/
pause
