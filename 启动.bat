@echo off
chcp 65001 >nul
title Local Canvas
cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (echo Node.js is not installed. https://nodejs.org && pause && exit /b 1)

if not exist "node_modules" (
    echo Installing dependencies (first run)...
    call npm install
    echo.
)

echo Backend: http://localhost:3001
echo Frontend: http://localhost:5173

start "" /B node src/index.js > backend_output.log 2>&1
start "" /B cmd /c "cd renderer && ..\node_portable\npx.cmd vite" > frontend_output.log 2>&1
echo Browser will open at http://localhost:5173
exit
