# AGENTS.md

## 基础行为

- 默认使用中文回答，除非用户明确要求其他语言。
- 回答要简洁直接，避免不必要的铺垫和重复。
- 如果任务描述不清晰，先提问确认，再开始执行。
- 不要主动推测用户意图之外的需求，只做被要求的事。

## 安全边界

- 默认只读：AI 不会主动修改或删除文件，除非你明确指示。
- 不可逆操作确认：在执行删除、覆盖或调用外部 API 写入等高危操作前，必须先向你确认。

## 🏗️ 工程规范 (Engineering Standards)

这部分规则定义了 AI 助手在编写和修改代码时的具体行为准则：

- **避免过度设计**：只做任务明确要求的改动，保持方案简洁。
- **不画蛇添足**：不主动添加未被要求的功能、重构代码或进行额外优化。
- **注释原则**：
  - 不为未改动的代码添加注释。
  - 仅在逻辑不明确时才添加注释。
- **代码清理**：确认无用的代码直接删除，不留注释说明。

## 🌐 网络与协作 (Network & Collaboration)

### Cloudflare WARP 代理配置

连接 GitHub 等海外服务时，建议使用 Cloudflare WARP 改善网络连通性：

1. 下载安装 [Cloudflare WARP](https://developers.cloudflare.com/warp-client/)
2. 启动后连上（`warp-cli.exe connect` 或通过 GUI）
3. 验证状态：`warp-cli.exe status` 应显示 "Connected"
4. 配置 Git 使用 WARP 代理：
   ```
   git config --global http.proxy http://127.0.0.1:40000
   git config --global https.proxy http://127.0.0.1:40000
   ```

## 🚀 启动方式 (Startup)

项目根目录有 4 个启动脚本：

| 文件 | 用途 |
|---|---|
| start.bat | **主启动入口**（推荐）— 自动安装依赖、启动后端+前端、等后端就绪后自动打开浏览器 |
| 启动.bat | 简化版启动 — 只启动服务，不等待后端就绪 |
| electron_start.bat | Desktop 版 — 启动后端+前端+Electron 窗口，退出后自动清理 |
| start.sh | macOS/Linux 启动脚本 |

### start.bat 流程

双击后执行顺序：

1. 检查 node_modules，缺失则 npm install（含错误提示）
2. 检查 renderer/node_modules，缺失则 npm install
3. 后台静默启动后端 (node src/index.js)
4. 后台静默启动前端 (vite --cwd renderer)
5. 健康检查循环：每秒 GET /api/health，直到返回 200
6. 浏览器自动打开 http://localhost:5173
7. 若未自动打开，控制台打印手动访问提示

关键技术决策：
- 后台进程使用 `start "" /B`，日志重定向到文件，不弹多余黑窗口
- 健康检查用 Node.js 内联 http.get，无需 curl
- 依赖安装失败时有国内镜像源提示 (registry.npmmirror.com) 并暂停

### electron_start.bat

启动后端+前端（带健康检查等待），启动 Electron 窗口，退出时自动清理 node.exe 子进程。日志写入 electron_start.log。

### 手动访问

- 前端：http://localhost:5173
- 后端 API：http://localhost:3001/api/health

### 端口占用处理

关闭之前启动的旧窗口（任务管理器结束 node.exe），重新双击 start.bat。
