@echo off
chcp 65001 >nul
title Local Canvas - Share Mode

echo ============================
echo   Local Canvas Share Mode
echo ============================
echo.

cd /d "%~dp0"
set PATH=%~dp0node_portable;%PATH%

:: ======================
:: 1. Check dependencies
:: ======================

if not exist "node_modules" (
    echo [Setup] Installing backend dependencies...
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        echo ERROR: Backend install failed
        pause
        exit /b 1
    )
)

if not exist "renderer\node_modules" (
    echo [Setup] Installing frontend dependencies...
    cd renderer
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        echo ERROR: Frontend install failed
        pause
        exit /b 1
    )
    cd ..
)

where ngrok >nul 2>&1
if errorlevel 1 (
    echo [Setup] Installing ngrok via winget...
    winget install ngrok.ngrok --accept-source-agreements
    if errorlevel 1 (
        echo ERROR: ngrok install failed. Please install manually from https://ngrok.com/download
        pause
        exit /b 1
    )
    :: Refresh PATH so ngrok is available immediately
    set PATH=%PATH%;%LOCALAPPDATA%\Microsoft\WinGet\Links
)

:: ======================
:: 2. Check ngrok auth
:: ======================

ngrok config check >nul 2>&1
if errorlevel 1 (
    echo.
    echo ============================================
    echo   ngrok needs a free account (one-time setup)
    echo.
    echo   1. Sign up at https://dashboard.ngrok.com/signup
    echo   2. Copy your authtoken from dashboard
    echo   3. Run: ngrok config add-authtoken YOUR_TOKEN
    echo.
    echo   Or use share_simple.bat for zero-setup mode.
    echo ============================================
    pause
    exit /b 1
)

:: ======================
:: 3. Kill old processes
:: ======================

taskkill /f /im ngrok.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: ======================
:: 4. Start services
:: ======================

echo [1/4] Starting backend...
start "" /B node src/index.js > backend_output.log 2>&1

echo [2/4] Starting frontend...
start "" /B node_portable\npx.cmd vite --cwd renderer > frontend_output.log 2>&1

:: ======================
:: 5. Wait until ready
:: ======================

echo [3/4] Waiting for services to be ready...
:wait_backend
node -e "require('http').get('http://localhost:3001/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(3000,()=>process.exit(1))" >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto wait_backend
)
echo         Backend ready.

:wait_frontend
node -e "require('http').get('http://localhost:5173',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(3000,()=>process.exit(1))" >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto wait_frontend
)
echo         Frontend ready.

:: ======================
:: 6. Start ngrok tunnel
:: ======================

echo [4/4] Creating public tunnel...
start "" /B ngrok http 5173 --log ngrok.log

:: Wait for ngrok to come up
timeout /t 4 /nobreak >nul

:: Extract public URL from ngrok API
node -e "const http=require('http');http.get('http://127.0.0.1:4040/api/tunnels',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{const t=JSON.parse(d).tunnels.find(t=>t.proto==='https');process.stdout.write(t?t.public_url:'NOT_FOUND')})}).on('error',()=>process.stdout.write('WAITING'))" > ngrok_url.tmp
set /p NGROK_URL=<ngrok_url.tmp
del ngrok_url.tmp

if "%NGROK_URL%"=="WAITING" (
    echo Waiting for ngrok to initialize...
    timeout /t 4 /nobreak >nul
    node -e "const http=require('http');http.get('http://127.0.0.1:4040/api/tunnels',res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{const t=JSON.parse(d).tunnels.find(t=>t.proto==='https');process.stdout.write(t?t.public_url:'NOT_FOUND')})}).on('error',()=>process.stdout.write('NOT_FOUND'))" > ngrok_url.tmp
    set /p NGROK_URL=<ngrok_url.tmp
    del ngrok_url.tmp
)

:: ======================
:: 7. Show result
:: ======================

echo.
echo ============================================
echo   Share this link with your WeChat friend:
echo.
echo   %NGROK_URL%
echo.
echo   Send via WeChat -> tap to open in browser.
echo   Press Ctrl+C to stop sharing.
echo ============================================
echo.

pause
