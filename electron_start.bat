@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Local Canvas
cd /d "%~dp0"
set PATH=%~dp0node_portable;%PATH%
set DEV_PORT=5173
set LOGFILE=%~dp0electron_start.log

if exist "%LOGFILE%" del "%LOGFILE%" 2>nul

echo [1/5] Checking dependencies...
>>"%LOGFILE%" echo [%DATE% %TIME%] ===== Local Canvas Desktop =====
if not exist node_modules (
  >>"%LOGFILE%" echo [%DATE% %TIME%] Installing backend deps...
  call npm install --no-fund --no-audit >>"%LOGFILE%" 2>&1
  if errorlevel 1 echo ERROR: Backend install failed & timeout /t 3 /nobreak >nul & exit /b 1
)
if not exist renderer\node_modules (
  cd renderer
  >>"%LOGFILE%" echo [%DATE% %TIME%] Installing frontend deps...
  call npm install --no-fund --no-audit >>"%LOGFILE%" 2>&1
  if errorlevel 1 cd .. & echo ERROR: Frontend install failed & timeout /t 3 /nobreak >nul & exit /b 1
  cd ..
)

echo [2/5] Starting backend...
>>"%LOGFILE%" echo [%DATE% %TIME%] Starting backend...
start "" /B node src/index.js > backend_output.log 2>&1

echo [3/5] Waiting for backend (port 3001)...
set RETRY=0
:wait_backend
set /a RETRY+=1
if !RETRY! gtr 30 (
  >>"%LOGFILE%" echo [%DATE% %TIME%] Backend timeout
  echo ERROR: Backend did not start in 30s
  timeout /t 3 /nobreak >nul & exit /b 1
)
node -e "require('http').get('http://localhost:3001/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(3000,()=>process.exit(1))" >nul 2>&1
if errorlevel 1 timeout /t 1 /nobreak >nul & goto wait_backend
>>"%LOGFILE%" echo [%DATE% %TIME%] Backend ready

echo [4/5] Starting Vite...
cd renderer
>>"%LOGFILE%" echo [%DATE% %TIME%] Starting Vite on port %DEV_PORT%...
start "" /B npx vite --port %DEV_PORT% >>"%LOGFILE%" 2>&1

set RETRY=0
:wait_frontend
set /a RETRY+=1
if !RETRY! gtr 30 (
  >>"%LOGFILE%" echo [%DATE% %TIME%] Frontend timeout
  echo ERROR: Frontend did not start in 30s
  timeout /t 3 /nobreak >nul & exit /b 1
)
node -e "require('http').get('http://localhost:5173',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(3000,()=>process.exit(1))" >nul 2>&1
if errorlevel 1 timeout /t 1 /nobreak >nul & goto wait_frontend
>>"%LOGFILE%" echo [%DATE% %TIME%] Frontend ready

echo [5/5] Starting Electron...
>>"%LOGFILE%" echo [%DATE% %TIME%] Starting Electron...
call node_modules\.bin\electron.cmd .
set EC=!ERRORLEVEL!
>>"%LOGFILE%" echo [%DATE% %TIME%] Electron exited with code !EC!
echo Electron exited (code: !EC!)

echo Cleaning up background processes...
>>"%LOGFILE%" echo [%DATE% %TIME%] Cleanup: killing our node child processes...
powershell -NoProfile -Command ^
  "Get-WmiObject Win32_Process -Filter ""Name='node.exe'"" ^
    | Where-Object { $_.CommandLine -match 'src\\\\index\\\\.js' -or $_.CommandLine -match 'vite' } ^
    | ForEach-Object { try { $_.Terminate() } catch {} }" ^
  >>"%LOGFILE%" 2>&1

echo Done. See electron_start.log for details.