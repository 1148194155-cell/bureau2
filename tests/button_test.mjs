/**
 * 前端按钮 ↔ 后端 API 全链路测试
 *
 * 梳理每个前端按钮/操作 → 后端端点，逐项验证通断。
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'fs-extra';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3097;
const BASE = `http://localhost:${PORT}/api`;
const H = { 'Content-Type': 'application/json' };
let pass = 0, fail = 0;
const results = [];

console.log('=== 前端↔后端按钮全链路测试 ===\n');

// ── 启动服务器 ──
const server = spawn('node', [path.join(ROOT, 'src', 'index.js')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', LC_DISABLE_AUTH: '1' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
await new Promise(resolve => {
  server.stdout.on('data', d => { if (d.toString().includes('REST API')) resolve(); });
});
console.log('服务器已启动\n');

async function api(method, url, body) {
  const opts = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${url}`, opts);
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, data };
}

let token = '';

// ═══════════════════════════════════════
//  工具栏 (Toolbar)
// ═══════════════════════════════════════

console.log('═══ 工具栏按钮 ═══');

// 1. 「模板」按钮 → GET /api/templates
{
  const r = await api('GET', '/templates');
  const ok = r.ok && r.data?.success !== false;
  console.log(`${ok ? '✓' : '✗'} 模板按钮 → GET /api/templates  (${r.status})`);
  results.push({ btn: '模板', endpoint: 'GET /api/templates', status: ok ? 200 : r.status });
  if (ok) pass++; else fail++;
}

// 2. 「运行」按钮 → POST /api/workflows/run
{
  const r = await api('POST', '/workflows/run', { nodes: [], edges: [] });
  // 空工作流应被 review 拒绝而非 crash
  const ok = r.status === 422 && r.data?.success === false;
  console.log(`${ok ? '✓' : '✗'} 运行按钮 → POST /api/workflows/run  (${r.status}) — 空工作流被正确拦截`);
  results.push({ btn: '运行', endpoint: 'POST /api/workflows/run(empty)', status: r.status });
  if (ok) pass++; else fail++;
}

// 3. 「保存」按钮 → POST /api/workflows
let createdId;
{
  const r = await api('POST', '/workflows', { name: 'test_btn', nodes: [], edges: [] });
  const ok = r.ok && r.data?.success !== false && r.data?.data?.id;
  if (ok) createdId = r.data.data.id;
  console.log(`${ok ? '✓' : '✗'} 保存按钮 → POST /api/workflows  (${r.status}) id=${createdId}`);
  results.push({ btn: '保存', endpoint: 'POST /api/workflows', status: r.status, id: createdId });
  if (ok) pass++; else fail++;
}

// 4. 「保存(更新)」 → PUT /api/workflows/:id
if (createdId) {
  const r = await api('PUT', `/workflows/${createdId}`, { name: 'test_btn_updated', nodes: [{ id: 'n1', type: 'input', data: {} }], edges: [] });
  const ok = r.ok;
  console.log(`${ok ? '✓' : '✗'} 保存(更新)按钮 → PUT /api/workflows/:id  (${r.status})`);
  results.push({ btn: '保存(更新)', endpoint: 'PUT /api/workflows/:id', status: r.status });
  if (ok) pass++; else fail++;
}

// 5. 「加载(列表)」按钮 → GET /api/workflows
{
  const r = await api('GET', '/workflows');
  const ok = r.ok && Array.isArray(r.data?.data);
  console.log(`${ok ? '✓' : '✗'} 加载(列表)按钮 → GET /api/workflows  (${r.status}) 共${r.data?.data?.length||0}条`);
  results.push({ btn: '加载(列表)', endpoint: 'GET /api/workflows', status: r.status, count: r.data?.data?.length });
  if (ok) pass++; else fail++;
}

// 6. 「加载(详情)」按钮 → GET /api/workflows/:id
if (createdId) {
  const r = await api('GET', `/workflows/${createdId}`);
  const ok = r.ok && r.data?.data?.name;
  console.log(`${ok ? '✓' : '✗'} 加载(详情)按钮 → GET /api/workflows/:id  (${r.status})`);
  results.push({ btn: '加载(详情)', endpoint: 'GET /api/workflows/:id', status: r.status });
  if (ok) pass++; else fail++;
}

// 7. 「删除」按钮 → DELETE /api/workflows/:id
if (createdId) {
  const r = await api('DELETE', `/workflows/${createdId}`);
  const ok = r.ok && r.data?.success !== false;
  console.log(`${ok ? '✓' : '✗'} 删除按钮 → DELETE /api/workflows/:id  (${r.status})`);
  results.push({ btn: '删除', endpoint: 'DELETE /api/workflows/:id', status: r.status });
  if (ok) pass++; else fail++;
}

// ═══════════════════════════════════════
//  资源面板 (ResourcePanel)
// ═══════════════════════════════════════

console.log('\n═══ 资源面板按钮 ═══');

// 8. Skills 标签 → GET /api/skills
{
  const r = await api('GET', '/skills');
  const ok = r.ok && Array.isArray(r.data?.data);
  console.log(`${ok ? '✓' : '✗'} Skills标签 → GET /api/skills  (${r.status}) 共${r.data?.data?.length||0}条`);
  results.push({ btn: 'Skills标签', endpoint: 'GET /api/skills', status: r.status });
  if (ok) pass++; else fail++;
}

// 9. Models 标签 → GET /api/models
{
  const r = await api('GET', '/models');
  const ok = r.ok && Array.isArray(r.data?.data);
  console.log(`${ok ? '✓' : '✗'} Models标签 → GET /api/models  (${r.status}) 共${r.data?.data?.length||0}条`);
  results.push({ btn: 'Models标签', endpoint: 'GET /api/models', status: r.status });
  if (ok) pass++; else fail++;
}

// 10. Knowledge 标签 → GET /api/knowledge
{
  const r = await api('GET', '/knowledge');
  const ok = r.ok && Array.isArray(r.data?.data);
  console.log(`${ok ? '✓' : '✗'} Knowledge标签 → GET /api/knowledge  (${r.status}) 共${r.data?.data?.length||0}条`);
  results.push({ btn: 'Knowledge标签', endpoint: 'GET /api/knowledge', status: r.status });
  if (ok) pass++; else fail++;
}

// 11. APIs 标签 → GET /api/apis
{
  const r = await api('GET', '/apis');
  const ok = r.ok && Array.isArray(r.data?.data);
  console.log(`${ok ? '✓' : '✗'} APIs标签 → GET /api/apis  (${r.status}) 共${r.data?.data?.length||0}条`);
  results.push({ btn: 'APIs标签', endpoint: 'GET /api/apis', status: r.status });
  if (ok) pass++; else fail++;
}

// ═══════════════════════════════════════
//  设置页面 (SettingsPage)
// ═══════════════════════════════════════

console.log('\n═══ 设置页面按钮 ═══');

// 12. 认证状态 → GET /api/auth/status
{
  const r = await api('GET', '/auth/status');
  const ok = r.ok && r.data?.success !== false;
  console.log(`${ok ? '✓' : '✗'} 认证状态 → GET /api/auth/status  (${r.status})`);
  results.push({ btn: '认证状态', endpoint: 'GET /api/auth/status', status: r.status });
  if (ok) pass++; else fail++;
}

// 13. 创建模型 → POST /api/models
let modelId;
{
  const r = await api('POST', '/models', { name: 'test_model', adapter_type: 'openai', config: { endpoint: 'http://test', model: 'test' } });
  const ok = r.ok && r.data?.data?.id;
  if (ok) modelId = r.data.data.id;
  console.log(`${ok ? '✓' : '✗'} 创建模型 → POST /api/models  (${r.status}) id=${modelId}`);
  results.push({ btn: '创建模型', endpoint: 'POST /api/models', status: r.status });
  if (ok) pass++; else fail++;
}

// 14. 删除模型 → DELETE /api/models/:id
if (modelId) {
  const r = await api('DELETE', `/models/${modelId}`);
  const ok = r.ok;
  console.log(`${ok ? '✓' : '✗'} 删除模型 → DELETE /api/models/:id  (${r.status})`);
  results.push({ btn: '删除模型', endpoint: 'DELETE /api/models/:id', status: r.status });
  if (ok) pass++; else fail++;
}

// 15. 列出 API Keys → GET /api/apikeys
{
  const r = await api('GET', '/apikeys');
  const ok = r.ok && Array.isArray(r.data?.data);
  console.log(`${ok ? '✓' : '✗'} 列出API Keys → GET /api/apikeys  (${r.status})`);
  results.push({ btn: '列出API Keys', endpoint: 'GET /api/apikeys', status: r.status });
  if (ok) pass++; else fail++;
}

// 16. 创建知识库 → POST /api/knowledge
let kbId;
{
  const tmpDir = path.join(ROOT, '.test_kb_' + Date.now());
  fs.ensureDirSync(tmpDir);
  const r = await api('POST', '/knowledge', { name: 'test_kb', folder_path: tmpDir });
  const ok = r.ok && r.data?.data?.id;
  if (ok) kbId = r.data.data.id;
  fs.removeSync(tmpDir);
  console.log(`${ok ? '✓' : '✗'} 创建知识库 → POST /api/knowledge  (${r.status}) id=${kbId}`);
  results.push({ btn: '创建知识库', endpoint: 'POST /api/knowledge', status: r.status });
  if (ok) pass++; else fail++;
}

// 17. 索引知识库 → POST /api/knowledge/:id/index
if (kbId) {
  const r = await api('POST', `/knowledge/${kbId}/index`, {});
  const ok = r.ok || r.status === 400; // 空知识库索引失败是合理的
  console.log(`${ok ? '✓' : '✗'} 索引知识库 → POST /api/knowledge/:id/index  (${r.status})`);
  results.push({ btn: '索引知识库', endpoint: 'POST /api/knowledge/:id/index', status: r.status });
  if (ok) pass++; else fail++;
}

// 18. 删除知识库 → DELETE /api/knowledge/:id
if (kbId) {
  const r = await api('DELETE', `/knowledge/${kbId}`);
  const ok = r.ok;
  console.log(`${ok ? '✓' : '✗'} 删除知识库 → DELETE /api/knowledge/:id  (${r.status})`);
  results.push({ btn: '删除知识库', endpoint: 'DELETE /api/knowledge/:id', status: r.status });
  if (ok) pass++; else fail++;
}

// ═══════════════════════════════════════
//  AI 对话
// ═══════════════════════════════════════

console.log('\n═══ AI 对话按钮 ═══');

// 19. 内置模型状态 → GET /api/builtin/status
{
  const r = await api('GET', '/builtin/status');
  const ok = r.ok;
  console.log(`${ok ? '✓' : '✗'} 内置模型状态 → GET /api/builtin/status  (${r.status})`);
  results.push({ btn: '内置模型状态', endpoint: 'GET /api/builtin/status', status: r.status });
  if (ok) pass++; else fail++;
}

// ═══════════════════════════════════════
//  执行相关 (RunLogWindow)
// ═══════════════════════════════════════

console.log('\n═══ 执行日志窗口按钮 ═══');

// 20. 运行一个简单工作流获取 execution_id
let execId;
{
  // Use auth registration + login to get token for authenticated endpoints
  const ts = Date.now();
  let r = await api('POST', '/auth/register', { username: 'testbtn_' + ts, password: 'pass1234' });
  const userOk = r.ok;
  if (userOk) {
    r = await api('POST', '/auth/login', { username: 'testbtn_' + ts, password: 'pass1234' });
    if (r.ok && r.data?.data?.token) {
      token = r.data.data.token;
      H['Authorization'] = 'Bearer ' + token;
    }
  }
  // Run workflow
  r = await api('POST', '/workflows/run', {
    nodes: [
      { id: 'btn1', type: 'input', position: { x: 0, y: 0 }, data: { label: 'In', input: { test: true } } },
      { id: 'btn2', type: 'output', position: { x: 200, y: 0 }, data: { label: 'Out' } },
    ],
    edges: [{ id: 'be1', source: 'btn1', target: 'btn2' }],
    options: {},
  });
  const ok = r.ok && r.data?.data?.execution_id;
  if (ok) execId = r.data.data.execution_id;
  console.log(`${ok ? '✓' : '✗'} 运行工作流(获取execId) → POST /api/workflows/run  (${r.status}) id=${execId}`);
  results.push({ btn: '运行工作流', endpoint: 'POST /api/workflows/run', status: r.status, execId });
  if (ok) pass++; else fail++;
}

if (execId) {
  // 21. 执行状态 → GET /api/executions/:id/status
  let execStatus;
  for (let i = 0; i < 10; i++) {
    const r = await api('GET', `/executions/${execId}/status`);
    if (r.data?.data?.status === 'completed' || r.data?.data?.status === 'failed') {
      execStatus = r.data.data.status;
      break;
    }
    await new Promise(rr => setTimeout(rr, 500));
  }
  const ok = execStatus !== undefined;
  console.log(`${ok ? '✓' : '✗'} 执行状态 → GET /api/executions/:id/status  status=${execStatus}`);
  results.push({ btn: '执行状态', endpoint: 'GET /api/executions/:id/status', status: execStatus });
  if (ok) pass++; else fail++;

  // 22. 执行历史 → GET /api/executions/history/:workflowId
  {
    const r = await api('GET', '/executions/history/0');
    const ok = r.ok && Array.isArray(r.data?.data);
    console.log(`${ok ? '✓' : '✗'} 执行历史 → GET /api/executions/history/:wfId  (${r.status})`);
    results.push({ btn: '执行历史', endpoint: 'GET /api/executions/history/:wfId', status: r.status });
    if (ok) pass++; else fail++;
  }
}

// 23. 工作流调度列表 → GET /api/schedules
{
  const r = await api('GET', '/schedules');
  const ok = r.ok && Array.isArray(r.data?.data);
  console.log(`${ok ? '✓' : '✗'} 调度列表 → GET /api/schedules  (${r.status})`);
  results.push({ btn: '调度列表', endpoint: 'GET /api/schedules', status: r.status });
  if (ok) pass++; else fail++;
}

// 24. 创建调度 → POST /api/schedules
let schedId;
{
  const r = await api('POST', '/workflows', { name: 'sched_test', nodes: [], edges: [] });
  if (r.ok && r.data?.data?.id) {
    const wfId = r.data.data.id;
    const r2 = await api('POST', '/schedules', { workflow_id: wfId, cron_expression: '0 0 * * *', enabled: false });
    const ok = r2.ok && r2.data?.data?.id;
    if (ok) schedId = r2.data.data.id;
    console.log(`${ok ? '✓' : '✗'} 创建调度 → POST /api/schedules  (${r2.status})`);
    results.push({ btn: '创建调度', endpoint: 'POST /api/schedules', status: r2.status });
    if (ok) pass++; else fail++;
  }
}

// 25. 删除调度 → DELETE /api/schedules/:id
if (schedId) {
  const r = await api('DELETE', `/schedules/${schedId}`);
  const ok = r.ok;
  console.log(`${ok ? '✓' : '✗'} 删除调度 → DELETE /api/schedules/:id  (${r.status})`);
  results.push({ btn: '删除调度', endpoint: 'DELETE /api/schedules/:id', status: r.status });
  if (ok) pass++; else fail++;
}

// ═══════════════════════════════════════
//  Webhook + 统计信息
// ═══════════════════════════════════════

console.log('\n═══ 其他按钮 ═══');

// 26. Webhook → POST /api/webhook/:name
{
  const r = await api('POST', '/webhook/btn_test_' + Date.now(), { test: true });
  const ok = r.ok && r.data?.data?.execution_id;
  console.log(`${ok ? '✓' : '✗'} Webhook → POST /api/webhook/:name  (${r.status})`);
  results.push({ btn: 'Webhook', endpoint: 'POST /api/webhook/:name', status: r.status });
  if (ok) pass++; else fail++;
}

// 27. 健康检查 → GET /api/health
{
  const r = await api('GET', '/health');
  const ok = r.ok && r.data?.status === 'ok';
  console.log(`${ok ? '✓' : '✗'} 健康检查 → GET /api/health  (${r.status})`);
  results.push({ btn: '健康检查', endpoint: 'GET /api/health', status: r.status });
  if (ok) pass++; else fail++;
}

// ═══════════════════════════════════════
//  汇总
// ═══════════════════════════════════════

console.log(`\n${'='.repeat(50)}`);
console.log(`结果: ${pass}/${pass+fail} 通过`);
console.log(`${'='.repeat(50)}`);

console.log(`\n详细统计:`);
for (const r of results) {
  const ok = r.status === 200 || r.status === 'completed' || r.status === 'ok';
  console.log(`  ${ok ? '✓' : '✗'} ${r.btn}: ${r.endpoint} → ${JSON.stringify(r.status)}`);
}

// 汇总报告写入产出文件夹
const outputDir = path.resolve(ROOT, '工作流产出');
fs.ensureDirSync(outputDir);
fs.writeJsonSync(path.join(outputDir, '03_button_test.json'), {
  timestamp: new Date().toISOString(),
  total: pass + fail,
  passed: pass,
  failed: fail,
  results,
}, { spaces: 2 });

// 清理
if (server) server.kill();
process.exit(fail > 0 ? 1 : 0);
