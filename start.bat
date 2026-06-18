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
    echo [1/3] Installing backend dependencies... (may take 2-3 minutes)
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        echo.
        echo ============================================
        echo   ERROR: Backend dependencies install failed
        echo   Check your network and try again
        echo   If you are in China, try: npm config set registry https://registry.npmmirror.com
        echo ============================================
        pause
        exit /b 1
    )
    echo.
)

if not exist "renderer\node_modules" (
    echo [2/3] Installing frontend dependencies... (may take 2-3 minutes)
    cd renderer
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        echo.
        echo ============================================
        echo   ERROR: Frontend dependencies install failed
        echo   Check your network and try again
        echo   If you are in China, try: npm config set registry https://registry.npmmirror.com
        echo ============================================
        pause
        exit /b 1
    )
    cd ..
    echo.
)

echo ============================
echo   Starting services...
echo   Backend  : http://localhost:3001
echo   Frontend : http://localhost:5173
echo ============================
echo.

start "" /B node src/index.js > backend_output.log 2>&1
start "" /B node_portable\npx.cmd vite --cwd renderer > frontend_output.log 2>&1

node -e "require('http').get('http://localhost:3001/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(3000,()=>process.exit(1))" >nul 2>&1
if errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait_backend
)
start http://localhost:5173
echo 浏览器已打开。

timeout /t 5 /nobreak >nul
echo.
echo ============================================
echo   If browser did not open:
echo   1. Open http://localhost:5173 manually
echo   2. If it failed, check console windows
echo ============================================
pause
exit
