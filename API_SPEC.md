# Local Canvas 后端 API 通道规格

> 本文档定义前端需要的所有后端接口。其他工具按此规格实现后端，前端通过 `api.js` 调用。

## 基础信息
- 协议: HTTP/1.1 REST + WebSocket
- 基础路径: `http://localhost:3001/api`
- WebSocket: `ws://localhost:3001/ws`
- Content-Type: `application/json`
- 认证: Header `X-User-Id: 1`（单用户模式）
- 统一响应格式: `{ success: boolean, data?: any, error?: string }`

---

## 一、Skills

### GET /api/skills
获取所有可用 Skill 列表。

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "id": "text-summary",
      "name": "文本摘要",
      "version": "1.0",
      "description": "对输入文本生成摘要",
      "input_schema": { "text": "string" },
      "output_schema": { "summary": "string" }
    }
  ]
}
```

---

## 二、Models

### GET /api/models
获取所有已配置的模型（含在线状态）。

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "GPT-4o",
      "adapter_type": "openai",
      "config": { "endpoint": "...", "model": "gpt-4o" },
      "is_active": true,
      "online": true
    }
  ]
}
```

### POST /api/models
添加新模型。

**请求体:**
```json
{
  "name": "模型名称",
  "adapter_type": "openai | ollama | anthropic",
  "config": { "endpoint": "https://...", "apiKey": "sk-...", "model": "gpt-4o" }
}
```

**响应:**
```json
{ "success": true, "data": { "id": 2, "name": "模型名称" } }
```

### DELETE /api/models/:id
删除模型。

---

## 三、API 端点

### GET /api/apis
获取所有 API 端点。

### POST /api/apis
添加 API 端点。

**请求体:**
```json
{
  "name": "天气API",
  "url": "https://api.weather.com/v1",
  "method": "GET",
  "headers": { "Authorization": "Bearer xxx" },
  "description": "获取天气数据"
}
```

### DELETE /api/apis/:id
删除 API 端点。

---

## 四、知识库

### GET /api/knowledge
获取所有知识库。

### POST /api/knowledge
创建知识库。

**请求体:**
```json
{ "name": "技术文档", "folder_path": "D:/docs/tech" }
```

### POST /api/knowledge/:id/index
触发索引重建。

**请求体:**
```json
{ "model_id": 1 }
```

### DELETE /api/knowledge/:id
删除知识库。

---

## 五、API Keys

### GET /api/apikeys
列出已保存的 Key（不返回实际 Key 值）。

**响应:**
```json
{
  "success": true,
  "data": [{ "id": 1, "name": "OpenAI", "key_ref": "lc_1_OpenAI_xxx" }]
}
```

### POST /api/apikeys
保存 API Key（加密存储）。

**请求体:**
```json
{ "name": "OpenAI", "api_key": "sk-xxx" }
```

### DELETE /api/apikeys/:id
删除 API Key。

---

## 六、工作流

### GET /api/workflows
列出所有工作流（仅摘要）。

### GET /api/workflows/:id
加载完整工作流。

**响应:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "我的工作流",
    "nodes": [
      { "id": "node_1", "type": "skill", "position": { "x": 300, "y": 200 }, "data": { "label": "文本摘要", "skillId": "text-summary", "config": {} } }
    ],
    "edges": [
      { "id": "e1-2", "source": "node_1", "target": "node_2" }
    ]
  }
}
```

### POST /api/workflows
保存新工作流。

**请求体:**
```json
{ "name": "我的工作流", "nodes": [...], "edges": [...] }
```

### PUT /api/workflows/:id
更新已有工作流。

### DELETE /api/workflows/:id
删除工作流。

### POST /api/workflows/share/:id
生成工作流分享链接。

**响应:**
```json
{ "success": true, "data": { "share_token": "base64token", "share_url": "/api/workflows/import/base64token" } }
```

### GET /api/workflows/import/:token
通过分享链接导入工作流。

**响应:**
```json
{ "success": true, "data": { "id": 1, "name": "我的工作流", "nodes": [...], "edges": [...] } }
```

### POST /api/workflows/run
执行工作流。

**请求体:**
```json
{ "nodes": [...], "edges": [...] }
// 或
{ "workflow_id": 1 }
```

**响应:**
```json
{ "success": true, "data": { "execution_id": "uuid-xxx" } }
```

### GET /api/executions/:id/status
查询执行状态和日志。

**响应:**
```json
{
  "success": true,
  "data": {
    "status": "running | completed | failed",
    "output_files": [],
    "logs": [
      { "level": "info", "message": "开始执行...", "timestamp": "..." }
    ]
  }
}
```

---

## 七、AI 对话

### POST /api/ai/chat
发送对话消息（含画布上下文）。

**请求体:**
```json
{
  "message": "帮我添加一个文本摘要节点",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "canvas_state": { "nodes": [...], "edges": [...] },
  "model_id": 1
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "reply": "好的，已添加文本摘要节点。",
    "actions": [
      { "type": "add_node", "payload": { "nodeType": "skill", "data": { "label": "文本摘要", "skillId": "text-summary" } } },
      { "type": "run_workflow", "payload": {} }
    ]
  }
}
```

**Action 类型:**

| type | payload | 说明 |
|------|---------|------|
| `add_node` | `{ nodeType, data: { label, config }, position? }` | 添加节点 |
| `connect` | `{ source_label, target_label }` | 添加连线 |
| `update_config` | `{ node_label, config }` | 更新节点配置 |
| `delete_node` | `{ node_label }` | 删除节点 |
| `set_workflow_name` | `{ name }` | 设置工作流名称 |
| `run_workflow` | `{}` | 触发执行 |
| `clear_canvas` | `{}` | 清空画布 |
| `list_workflows` | `{}` | 列出所有工作流 |
| `read_file` | `{ file_path }` | 读取文件 |
| `write_file` | `{ file_path, content, force? }` | 写入文件 |
| `navigate_to_settings` | `{}` | 导航到设置页 |

---

## 八、WebSocket（执行日志）

连接: `ws://localhost:3001/ws`

### 前端 → 后端
```json
{ "type": "subscribe", "execution_id": "uuid-xxx" }
```

### 后端 → 前端
```json
{ "type": "log", "data": { "level": "info", "message": "...", "timestamp": "..." } }
```
```json
{ "type": "complete", "result": { ... } }
```
```json
{ "type": "error", "error": "错误信息" }
```

---

## 九、健康检查

### GET /api/health
```json
{ "status": "ok", "timestamp": "..." }
```
