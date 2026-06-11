@echo off
chcp 65001 >nul
title Local Canvas

echo ============================
echo   Local Canvas Launcher
echo ============================
echo.

cd /d "%~dp0"
set PATH=%~dp0node_portable;%PATH%

if not exist "node_modules" (
    echo [1/3] Installing backend dependencies...
    call npm install --no-fund --no-audit 2>nul
    echo.
)

if not exist "renderer\node_modules" (
    echo [2/3] Installing frontend dependencies...
    cd renderer
    call npm install --no-fund --no-audit 2>nul
    cd ..
    echo.
)

echo ============================
echo   Starting services...
echo   Backend  : http://localhost:3001
echo   Frontend : http://localhost:5173
echo ============================
echo.

start "Local Canvas - Backend" cmd /c "cd /d %~dp0 && title Backend && node src/index.js"
start "Local Canvas - Frontend" cmd /c "cd /d %~dp0\renderer && title Frontend && ..\node_portable\npx.cmd vite"

start http://localhost:5173
echo All set! Browser should open shortly.
exit
