@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js no esta instalado o no esta en PATH.
  echo Instala Node.js LTS y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm no esta instalado o no esta en PATH.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias locales...
  call npm install
  if errorlevel 1 (
    echo.
    echo No se pudieron instalar las dependencias.
    echo Revisa que haya espacio libre en disco y vuelve a intentar.
    pause
    exit /b 1
  )
)

if not exist .next\BUILD_ID (
  echo Preparando version instalable...
  call npm run build
  if errorlevel 1 (
    echo.
    echo No se pudo preparar la version instalable.
    pause
    exit /b 1
  )
)

echo.
echo Iniciando Control de EPP en http://localhost:3000
start "" "http://localhost:3000"
call npm run local:start

pause
