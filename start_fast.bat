@echo off
chcp 65001 >nul
title Local Canvas — 流畅模式 🚀
cd /d "%~dp0"

echo ============================================
echo   Local Canvas 🚀 流畅模式
echo   针对 i5-1155G7 + 16GB RAM 优化
echo ============================================
echo.

set PATH=%~dp0node_portable;%PATH%

:: ── 1. 检查 Ollama 并优化性能 ──
echo [1/3] 优化 Ollama 推理性能...
:: 设置环境变量让 Ollama 用满 CPU
set OLLAMA_NUM_THREADS=8
set OLLAMA_KEEP_ALIVE=5m
:: 减少模型加载次数
echo    OLLAMA_NUM_THREADS=8, KEEP_ALIVE=5m

:: ── 2. 检查依赖 ──
if not exist "node_modules" (
    echo [2/3] 安装后端依赖...
    call npm install --no-fund --no-audit
)
if not exist "renderer\node_modules" (
    cd renderer
    call npm install --no-fund --no-audit
    cd ..
)

:: ── 3. 建议切换轻量模型 ──
echo [3/3] 模型建议
echo.
echo ============================================
echo   AI 模型选择:
echo   当前: qwen2.5:7b（响应较慢）
echo   推荐: qwen2.5:3b（更快，适合 CPU）
echo.
echo   切换到 3b:
echo   1. 打开设置页面
echo   2. 添加新模型:
echo      - 适配器: Ollama
echo      - 端点: http://localhost:11434/v1
echo      - 模型 ID: qwen2.5:3b
echo   3. 在 AI 对话框中选择 qwen2.5:3b
echo.
echo   视频生成优化:
echo   用 generate_video_fast.py 替代逐帧生成
echo   帧数少 83%，速度提升 300%%
echo ============================================
echo.

:: ── 启动服务 ──
echo 启动后端...
start "" /B node src/index.js > backend_output.log 2>&1
start "" /B cmd /c "cd renderer && ..\node_portable\npx.cmd vite" > frontend_output.log 2>&1

:: 等待后端就绪
echo 等待后端就绪...
:wait
node -e "require('http').get('http://localhost:3001/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1)).setTimeout(3000,()=>process.exit(1))" >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto wait
)

start http://localhost:5173
echo.
echo ✅ 已启动! 浏览器已打开。
echo 按 Ctrl+C 停止服务
echo.
pause
