# Local Canvas — 可视化 AI 工作流画布

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)

拖拽节点即可构建 AI 工作流。完全本地运行，支持多模型切换、知识库 RAG、API 集成和内置 AI 对话。

## 功能

- **拖拽式画布** — 可视化搭建 AI 工作流
- **多模型支持** — OpenAI / Ollama / Anthropic / llama.cpp / 内置本地模型
- **知识库 RAG** — 索引本地文档，增强 AI 上下文
- **API 集成** — 在工作流中调用外部服务
- **内置 AI 对话** — 自然语言控制画布操作
- **Electron 桌面应用** — Windows / macOS / Linux 跨平台

## 安装方式

### 方式一：作为 Codex 插件安装

在 Codex 侧边栏 → 插件市场 → 搜索 "Local Canvas" → 点击安装。

或者手动克隆：

```bash
git clone https://github.com/1148194155-cell/bureau2.git
```

### 方式二：作为 OpenAI 兼容 Skill 使用

将 `local-canvas/` 目录放入任意 OpenAI agent 的 skills 路径下即可自动发现。

### 方式三：独立运行

```bash
node -v  # 需要 Node.js >= 18
cd local-canvas/scripts
npm install
cd renderer
npm install
cd ..
node src/index.js    # 后端 http://localhost:3001
npx vite --cwd renderer  # 前端 http://localhost:5173
```

## 快速开始

```powershell
.\local-canvas\scripts\start.ps1           # 启动前后端
.\local-canvas\scripts\start.ps1 -NoBrowser # 不自动打开浏览器
.\local-canvas\scripts\stop.ps1            # 停止服务
```

启动后访问：
- 前端界面：http://localhost:5173
- 后端 API：http://localhost:3001/api
- 健康检查：http://localhost:3001/api/health

## 项目结构

```
local-canvas/
├── skills/SKILL.md          # AI skill 指令
├── agents/openai.yaml       # OpenAI agent 元数据
├── .codex-plugin/plugin.json # Codex 插件清单
├── scripts/
│   ├── src/                 # 后端 (Express + SQLite + WebSocket)
│   ├── renderer/            # 前端 (React + Vite + React Flow)
│   ├── start.ps1            # 一键启动 (Windows)
│   └── stop.ps1             # 停止服务
└── assets/                  # 资源文件
```

## 许可证

[MIT](LICENSE)
