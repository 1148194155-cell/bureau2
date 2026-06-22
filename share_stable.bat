@echo off
chcp 65001 >nul
title Local Canvas - Stable Share

echo ============================
echo   Local Canvas Stable Share
echo   (Cloudflare Tunnel + Auto-Reconnect)
echo ============================
echo.

cd /d "%~dp0"
set PATH=%~dp0node_portable;%PATH%
set LC_DISABLE_AUTH=1

:: ---- Kill old ----
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: ---- Start Backend ----
echo [1/3] Starting backend...
start "" /B node src/index.js > backend_output.log 2>&1

:wait_backend
node -e "require('http').get('http://localhost:3001/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(3000,()=>process.exit(1))" >nul 2>&1
if errorlevel 1 (timeout /t 2 /nobreak >nul & goto wait_backend)

:: ---- Start Frontend ----
echo [2/3] Starting frontend...
cd renderer
start "" /B ..\node_portable\npx.cmd vite > ..\frontend_output.log 2>&1
cd ..

:wait_frontend
node -e "require('http').get('http://localhost:5173',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(3000,()=>process.exit(1))" >nul 2>&1
if errorlevel 1 (timeout /t 2 /nobreak >nul & goto wait_frontend)

echo         Both services ready.

:: ---- Cloudflare Tunnel with Auto-Restart ----
echo [3/3] Starting Cloudflare Tunnel (auto-reconnect enabled)...
echo.

set URL_FOUND=0

:tunnel_loop
start "" /B cloudflared tunnel --url http://localhost:5173 --protocol http2 --edge-ip-version 4 > cf_stdout.log 2> cf_stderr.log
set CF_PID=%ERRORLEVEL%

:: Wait for tunnel to establish
timeout /t 8 /nobreak >nul

:: Extract URL
for /f "tokens=*" %%a in ('type cf_stderr.log ^| findstr "trycloudflare.com"') do set TUNNEL_URL=%%a
set TUNNEL_URL=%TUNNEL_URL:*https =https%
set TUNNEL_URL=%TUNNEL_URL: | =%
set TUNNEL_URL=%TUNNEL_URL:|=%
set TUNNEL_URL=%TUNNEL_URL: =%

if "%URL_FOUND%"=="0" if not "%TUNNEL_URL%"=="" (
    set URL_FOUND=1
    echo ============================================
    echo   Share this link with your friend:
    echo.
    echo   %TUNNEL_URL%
    echo.
    echo   Tunnel auto-restarts if disconnected.
    echo   Press Ctrl+C to stop.
    echo ============================================
    echo.
)

:: Monitor cloudflared - restart if it dies
:monitor
timeout /t 10 /nobreak >nul
tasklist /fi "imagename eq cloudflared.exe" 2>nul | find /i "cloudflared.exe" >nul
if errorlevel 1 (
    echo [%time%] Tunnel lost, reconnecting...
    goto tunnel_loop
)
goto monitor
