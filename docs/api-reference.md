# API 参考文档

## 基础信息

- **Base URL:** `http://localhost:3001/api`
- **Content-Type:** `application/json`
- **Auth Header:** `X-User-Id: 1`

---

## 认证

### POST /auth/login
登录获取 token。
```json
{ "username": "admin", "password": "admin" }
```
返回: `{ "success": true, "data": { "token": "..." } }`

### POST /auth/register
注册新用户。
```json
{ "username": "user", "password": "pass" }
```

---

## 工作流

### GET /workflows
列出所有工作流。

### POST /workflows
创建新工作流。
```json
{ "name": "我的工作流", "nodes": [], "edges": [] }
```

### GET /workflows/:id
获取工作流详情（含 nodes/edges）。

### PUT /workflows/:id
更新工作流。

### DELETE /workflows/:id
删除工作流及相关执行记录。

### POST /workflows/run
执行工作流。
```json
{ "workflow_id": 1 }
// 或
{ "nodes": [...], "edges": [...] }
```
返回: `{ "execution_id": "uuid" }`

---

## 执行

### GET /executions/:id/status
查询执行状态、日志和结果。
返回:
```json
{
  "status": "completed",
  "logs": [{ "level": "info", "message": "...", "timestamp": "..." }],
  "results": [{ "nodeId": "n1", "nodeName": "输入", "success": true, "output": {} }],
  "output_files": [...]
}
```

### POST /executions/:id/cancel
取消运行中的执行。

### POST /executions/compare
对比两次执行。
```json
{ "execution_id_a": "uuid-a", "execution_id_b": "uuid-b" }
```

### GET /executions/history/:workflowId
获取工作流的执行历史。

---

## 模型

### GET /models
列出所有模型。

### POST /models
添加模型。
```json
{
  "name": "GPT-4",
  "adapter_type": "openai",
  "config": { "endpoint": "https://api.openai.com/v1", "model": "gpt-4o", "apiKey": "sk-..." }
}
```

### DELETE /models/:id
删除模型。

---

## 技能

### GET /skills
列出所有可用技能。

---

## 知识库

### GET /knowledge
列出知识库。

### POST /knowledge
创建知识库。
```json
{ "name": "我的文档", "folder_path": "/path/to/docs" }
```

### POST /knowledge/:id/index
触发索引。

### DELETE /knowledge/:id
删除知识库。

---

## AI 对话

### POST /ai/chat
AI 对话（支持画布操作）。
```json
{
  "message": "帮我加一个翻译节点",
  "history": [],
  "canvas_state": { "nodes": [...], "edges": [...] },
  "lang": "zh"
}
```

---

## 其他

### GET /templates
获取工作流模板列表。

### GET /docker/status
查询 Docker 沙箱可用状态。

### GET /health
健康检查。
