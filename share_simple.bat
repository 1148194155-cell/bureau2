@echo off
chcp 65001 >nul
title Local Canvas - IPv6 Share

echo ============================
echo   Local Canvas - IPv6 Share
echo ============================
echo.

cd /d "%~dp0"
set PATH=%~dp0node_portable;%PATH%

if not exist "node_modules" (
    echo [Setup] Installing backend dependencies...
    call npm install --no-fund --no-audit
    if errorlevel 1 (echo ERROR & pause & exit /b 1)
)
if not exist "renderer\node_modules" (
    echo [Setup] Installing frontend dependencies...
    cd renderer
    call npm install --no-fund --no-audit
    if errorlevel 1 (echo ERROR & pause & exit /b 1)
    cd ..
)

taskkill /f /im node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [1/2] Starting services...
start "" /B node src/index.js > backend_output.log 2>&1
cd renderer
start "" /B ..\node_portable\npx.cmd vite > ..\frontend_output.log 2>&1
cd ..

:wait_backend
node -e "require('http').get('http://localhost:3001/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(3000,()=>process.exit(1))" >nul 2>&1
if errorlevel 1 (timeout /t 2 /nobreak >nul & goto wait_backend)

:wait_frontend
node -e "require('http').get('http://localhost:5173',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(3000,()=>process.exit(1))" >nul 2>&1
if errorlevel 1 (timeout /t 2 /nobreak >nul & goto wait_frontend)

echo [2/2] Getting IPv6 address...
node -e "const os=require('os');const ifaces=os.networkInterfaces();for(const[name,addrs]of Object.entries(ifaces)){for(const a of addrs){if(a.family==='IPv6'&&!a.internal&&a.scopeid===0){process.stdout.write(a.address);process.exit(0)}}}" > ipv6.tmp
set /p IPV6=<ipv6.tmp
del ipv6.tmp

echo.
echo ============================================
echo   Share this link with your WeChat friend:
echo.
echo   http://[%IPV6%]:5173
echo.
echo   They can open it on mobile browser.
echo   (IPv6 required - most phones have it)
echo ============================================
echo.
echo Press Ctrl+C to stop.
pause
