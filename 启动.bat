@echo off
chcp 65001 >nul
title Local Canvas
cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (echo Node.js 未安装！https://nodejs.org && pause && exit /b 1)

if not exist "node_modules" (
    echo 正在安装依赖（首次运行需等待）...
    call npm install
    echo.
)

echo 后端: http://localhost:3001
echo 前端: http://localhost:5173

start "Backend" cmd /c "cd /d %~dp0 && node src/index.js"
start "Frontend" cmd /c "cd /d %~dp0\renderer && npm run dev"
echo 浏览器打开 http://localhost:5173
exit
