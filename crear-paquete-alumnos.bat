@echo off
title Generador de Paquete Portable para Alumnos - MCU Maker
echo ===================================================
echo     Generando Paquete Portable para Alumnos (MCU Maker)
echo ===================================================
echo.

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo [1/3] Verificando compilacion del frontend...
if exist "frontend\dist\index.html" (
    echo [OK] frontend\dist ya esta compilado.
) else (
    echo [INFO] Compilando frontend para empaquetado...
    cd frontend
    call npm.cmd run build:docker
    cd ..
)

echo.
echo [2/3] Verificando archivos temporales...

echo.
echo [3/3] Comprimiendo paquete portable (excluyendo .git, target y node_modules)...
set "ZIP_OUT=%ROOT%MCU-Maker-Portable-Alumnos.zip"
if exist "%ZIP_OUT%" del /f /q "%ZIP_OUT%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$dest = '%ZIP_OUT%';" ^
  "$exclude = @('.git', 'node_modules', '.vite', 'target', 'artifacts', '*.zip');" ^
  "Write-Host 'Comprimiendo archivos en: ' $dest -ForegroundColor Cyan;" ^
  "$items = Get-ChildItem -Path '.' -Exclude $exclude;" ^
  "Compress-Archive -Path $items -DestinationPath $dest -CompressionLevel Optimal -Force;" ^
  "Write-Host '[EXITO] Paquete creado exitosamente:' $dest -ForegroundColor Green;"

echo.
echo ===================================================
echo  Listo! Ya puedes subir o copiar MCU-Maker-Portable-Alumnos.zip
echo ===================================================
echo.
pause
