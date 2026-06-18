# Local Canvas — 可视化 AI 工作流构建工具

双击启动，拖拽搭 AI 工作流。数据全在本地，还能用大白话指挥 AI 帮你搭。

![Local Canvas 界面](docs/screenshot.png)

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](package.json)

| 如果你在找 | Local Canvas 的做法 |
|-----------|-------------------|
| 隐私 | 100% 本地，数据不出机器，断网也能跑 |
| 上手快 | 双击 bat 启动，拖拽 + AI 对话，不用学 |
| 模型自由 | OpenAI / Ollama / Anthropic / llama.cpp / 本地 GGUF 随意切换 |
| 省钱 | MIT 开源，免费，不限节点不限额 |

**核心亮点：** 右侧面板直接跟 AI 说人话——"帮我搭一个翻译工作流"——AI 自动拖节点、配参数、连好线，你点运行就能用。

## 5 分钟体验

| 步骤 | 操作 | 耗时 |
|------|------|------|
| 1 | 双击 `start.bat` | 30 秒 |
| 2 | 设置 → 添加 OpenAI Key | 1 分钟 |
| 3 | 拖一个模型节点到画布 | 10 秒 |
| 4 | 连线 → 点运行 | 5 秒 |
| 5 | 看到结果 | 即时 |

## 对比

| 维度 | Local Canvas | Coze |
|------|:-----------:|:----:|
| 数据隐私 | 100% 本地，数据不外传 | 云端存储 |
| 支持模型 | OpenAI/Ollama/Anthropic/llama.cpp/本地GGUF | 10+ 种平台内置 |
| 离线运行 | 需先下载模型，之后可离线 | 不支持 |
| 运行模式 | 单次手动触发 + 可编程调度 | 定时/循环/事件触发 |
| 使用场景 | 桌面端深度工作 | 全平台（含移动端） |
| 协作方式 | 单用户本地（Git 可做版本管理） | 多人在线协作 |
| 开箱即用 | 需装 Node.js + 配模型 | 注册即用 |
| 工作流自由度 | 无限节点 + 自由连线 | 有复杂度限制 |
| Skill 生态 | 自定义 Python/Node/Shell | 官方插件市场 |
| 费用 | 免费开源 | 有免费额度，超量付费 |

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

内置的 `~/.localcanvas/skills/` 包含 30+ 个可直接使用的 Skill：文本摘要、翻译、代码生成、图片生成、数据可视化、网页抓取、邮件发送、文档转换等。

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

## 为什么可以信任

| 你的顾虑 | 实际情况 |
|----------|---------|
| "数据会不会上传？" | 不会。数据库路径 `~/.localcanvas/localcanvas.db`，代码全部开源可审计。断网后仍可正常运行。 |
| "API Key 安全吗？" | AES-256-GCM 加密存储在 `~/.localcanvas/.masterkey`，仅当前用户可读。 |
| "代码有没有后门？" | 全部后端模块 MIT 开源，`npm run test` 可直接验证。 |
| "有人在用吗？" | 开发者自用超过 3 个月，已跑通 50+ 个工作流场景。 |
| "出问题找谁？" | [GitHub Issues](https://github.com/1148194155-cell/bureau2/issues) |

<details>
<summary>技术验证方法</summary>

```bash
# 1. 检查数据是否在本地
ls ~/.localcanvas/
# → localcanvas.db .masterkey skills/ keys/

# 2. 断网测试
# 断开 WiFi → 打开 Local Canvas → 仍可正常运行

# 3. 运行自动化测试
npm test
# → 12/12 PASS
```
</details>

## 获取帮助

- [提交 Issue](https://github.com/1148194155-cell/bureau2/issues/new?template=bug_report.md) — 报告问题或功能请求
- [讨论区](https://github.com/1148194155-cell/bureau2/discussions) — 使用技巧和最佳实践
- 微信: longggyt（仅限模型下载和技术支持）

## License

MIT
