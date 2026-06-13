# Local Canvas — 可视化 AI 工作流构建工具

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)

Local Canvas 是一个搭 AI 工作流的本地工具。你可以在白板上拖拽组合各种 AI 能力，做成一个自动化流程，一键运行。

支持本地运行 Qwen2.5-3B（需自行下载 ~2.1GB GGUF 放至 models/ 目录），无需联网、无需 Key、无需装 Ollama。

## 功能

- **可视化工作流** — 拖拽节点、连线，搭 AI 工作流
- **多模型支持** — OpenAI / Ollama / Anthropic / llama.cpp / 本地模型（需下载）
- **知识库 RAG** — 把本地文件夹索引到向量库，让 AI 检索你的文档
- **API 集成** — 添加自定义 API 端点拼接工作流
- **本地 AI 对话** — 右侧面板直接用大白话指挥 AI 操作画布
- **Electron 桌面应用** — Windows / macOS / Linux 全平台

## 对比

| 维度 | Local Canvas | 竞品 (Coze/Dify) |
|------|:-----------:|:---------------:|
| 数据存储 | 本地 SQLite，不外传 | 云端，数据在对方服务器 |
| 模型 | 支持 Qwen2.5-3B（需下载）+ OpenAI/Ollama/Anthropic/llama.cpp | 仅平台内置模型 |
| 工作流 | 无限节点、自由连线、字段映射 | 有节点数和复杂度限制 |
| 知识库 | 本地文件索引 + RAG，完全私密 | 需上传文件到云端 |
| 离线 | 100% 本地运行（配本地模型后无需联网） | 必须联网 |
| 扩展 | 写 Python/Node/Shell Skill 自由扩展 | 平台封闭，仅内置工具 |
| 本地模型 | 支持 Qwen2.5-3B（需自行下载 2.1GB GGUF） | 通常不提供本地模型 |
| Skill 生态 | 开放 Skill 系统（Python/Node/Shell） | 封闭的工具生态 |

## 快速开始

### 前提

- **Node.js >= 18**（[nodejs.org](https://nodejs.org) 下载 LTS 版本）

### 安装与启动

**Windows：** 双击 `start.bat`

**Mac/Linux：** `chmod +x start.sh && bash start.sh`

第一次运行会下载依赖包，约 2-3 分钟。之后启动很快。

等到提示后，浏览器会自动打开 `http://localhost:5173`

### 5 分钟上手

1. 打开首页，先在设置里配一个模型（或放 Qwen2.5-3B GGUF 到 models/ 目录）
2. 从左边把「模型」节点拖到白板上
3. 点一下节点，在配置面板绑定模型，参数填：`{ "prompt": "把以下内容翻译成英文: {{input}}" }`
4. 点工具栏的「运行」
5. 在弹出的输入框里输入中文，看日志结果

或者直接用 AI 对话：

在右侧对话框输入：*"帮我搭一个翻译工作流，把用户输入的中文翻译成英文"* — AI 会自动完成以上全部步骤。

## 项目结构

```
localcanvas/
├── src/                   # 后端（Express + SQLite + WebSocket）
│   ├── engine/            # 工作流执行引擎（DAG 拓扑排序 + 并行执行）
│   ├── models/            # AI 模型适配器（OpenAI/Ollama/Anthropic/llama.cpp）
│   ├── ai/                # AI 对话 + 工具调用（ReAct 模式）
│   ├── scanner/           # 资源扫描器（Skills/Models/APIs/知识库）
│   ├── review/            # 工作流审查器（结构/配置/安全校验）
│   └── routes/            # REST API 路由
├── renderer/              # 前端（React + Vite + Zustand + ReactFlow）
│   └── src/
│       ├── components/    # 画布/工具栏/资源面板/AI对话/自定义节点
│       ├── pages/         # CanvasPage / SettingsPage
│       └── store/         # Zustand 状态管理
├── electron/              # Electron 桌面壳
├── models/                # （可选）本地 AI 模型文件（builtin.gguf）
└── public/                # 构建产物（前端静态文件）
```

## 可用 Skill 目录

内置的 `~/.localcanvas/skills/` 包含 30+ 个开箱即用的 Skill：文本摘要、翻译、代码生成、图片生成、数据可视化、网页抓取、邮件发送、文档转换等。

同时自动发现 `~/.codex/skills/` 和 `~/.agents/skills/` 下的 SKILL.md 技能。

## 开发

```bash
# 安装所有依赖（后端 + 前端）
npm run setup

# 开发模式（后端 3001 + 前端 5173 热更新）
npm run dev:all

# 仅后端
npm run dev

# 仅前端
npm run dev:frontend

# 生产构建
npm run build
```

## License

MIT
