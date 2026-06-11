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
