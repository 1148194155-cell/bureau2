# Local Canvas

> A visual AI workflow builder that runs entirely on your machine.
> 一个完全在本地运行的 AI 工作流可视化搭建工具。

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)

## Features

- 🎨 **Drag-and-drop canvas** — build AI workflows visually
- 🔌 **Multi-model support** — OpenAI, Ollama, Anthropic, llama.cpp, built-in local model
- 📚 **Knowledge bases** — index local documents for RAG
- 🔗 **API integration** — connect external services
- 💬 **Built-in AI chat** — natural language canvas control
- 💻 **Electron desktop app** — cross-platform

## 功能

- 🎨 **拖拽式画布** — 可视化搭建 AI 工作流
- 🔌 **多模型支持** — OpenAI、Ollama、Anthropic、llama.cpp、内置本地模型
- 📚 **知识库** — 索引本地文档实现 RAG
- 🔗 **API 集成** — 连接外部服务
- 💬 **内置 AI 对话** — 自然语言控制画布
- 💻 **Electron 桌面应用** — 跨平台

## Quick Start

```bash
node -v  # need >= 18
npm install
npm start
```

Open http://localhost:5173

## 快速开始

```bash
node -v  # 需要 >= 18
npm install
npm start
```

打开 http://localhost:5173

## Project Structure / 项目结构

```
local-canvas/
├── src/           # Backend (Express + SQLite)
├── renderer/      # Frontend (React + Vite)
└── electron/      # Desktop shell (optional)
```

## License / 许可证

[MIT](LICENSE)
