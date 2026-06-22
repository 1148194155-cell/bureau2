@echo off
chcp 65001 >nul
title Local Canvas
setlocal enabledelayedexpansion

rem ── /stop parameter: clean up all related processes ──
if /i "%~1"=="/stop" (
    echo Cleaning up Local Canvas processes...
    for /f "tokens=2" %%p in ('tasklist /fi "imagename eq node.exe" /fo table /nh ^| findstr /i "node.exe"') do (
        wmic process where "processid=%%p" get commandline 2>nul | findstr /c:"%~dp0" >nul
        if not errorlevel 1 (
            echo Killing node.exe PID %%p
            taskkill /f /pid %%p >nul 2>&1
        )
    )
    echo Done.
    pause
    exit /b 0
)

echo ============================
echo   Local Canvas Launcher
echo ============================
echo.

cd /d "%~dp0"
set PATH=%~dp0node_portable;%PATH%

rem ── Port check: 3001 already in use? ──
node -e "require('http').get('http://localhost:3001/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(2000,()=>process.exit(1))" >nul 2>&1
if not errorlevel 1 (
    echo.
    echo ============================================
    echo   Local Canvas is already running on port 3001
    echo   Frontend : http://localhost:5173
    echo   Backend  : http://localhost:3001
    echo ============================================
    echo.
    start http://localhost:5173
    pause
    exit /b 0
)

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

rem ── Ensure pino-pretty is installed (may be removed by npm install) ──
if exist "node_modules" (
    node -e "require.resolve('pino-pretty')" >nul 2>&1
    if errorlevel 1 (
        echo [*] Installing pino-pretty (required for dev logging)...
        call npm install pino-pretty --no-fund --no-audit --no-save 2>nul
        if errorlevel 1 (
            echo [*] pino-pretty install skipped (will use JSON logging)
        )
    )
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
start "" /B cmd /c "cd renderer && ..\node_portable\npx.cmd vite" > frontend_output.log 2>&1

rem ── Health check with max retries (60s timeout) ──
set RETRY_COUNT=0
set MAX_RETRIES=30

:wait_backend
node -e "require('http').get('http://localhost:3001/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(3000,()=>process.exit(1))" >nul 2>&1
if not errorlevel 1 goto backend_ready
set /a RETRY_COUNT+=1
if !RETRY_COUNT! geq %MAX_RETRIES% (
    echo.
    echo ============================================
    echo   ERROR: Backend failed to start after %MAX_RETRIES% retries
    echo   Check backend_output.log for details:
    echo ============================================
    type backend_output.log 2>nul
    echo ============================================
    pause
    exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_backend

:backend_ready
start http://localhost:5173

echo.
echo ============================================
echo   Local Canvas 正在运行:
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:3001
echo   Health   : http://localhost:3001/api/health
echo ============================================
echo.
echo 按 Ctrl+C 停止所有服务
pause
