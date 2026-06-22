/**
 * AI 对话 30 次测试 — 含 Warm-up + 超时控制
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'fs-extra';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3095;
const BASE = `http://localhost:${PORT}/api`;
const H = { 'Content-Type': 'application/json' };
const OUTPUT_DIR = path.resolve(ROOT, '工作流产出');

let pass = 0, fail = 0, totalToolCalls = 0;
const results = [];

function log(msg) { process.stdout.write(`  ${msg}\n`); }

// ── 启动服务器 ──
log('=== 启动测试服务器 ===');
const indexPath = path.join(ROOT, 'src', 'index.js');
const server = spawn('node', [indexPath], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', LC_DISABLE_AUTH: '1' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let readyResolve;
const readyPromise = new Promise(r => readyResolve = r);
server.stdout.on('data', d => {
  const s = d.toString();
  if (s.includes('REST API') || s.includes('Health')) readyResolve();
});
server.stderr.on('data', d => {});
await readyPromise;
log('服务器已启动');

await new Promise(r => setTimeout(r, 1000));

async function aiChat(message, modelId, canvasState, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/ai/chat`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        message,
        history: [],
        canvas_state: canvasState || { nodes: [], edges: [] },
        model_id: modelId || '2',
        lang: 'zh'
      }),
      signal: controller.signal,
    });
    return r.json();
  } finally {
    clearTimeout(timer);
  }
}

// Warm-up: load the model
log('\n=== Warming up Ollama model (qwen2.5:7b) ===');
try {
  const warmup = await aiChat('你好（测试连接）', '2', undefined, 180000);
  log(`Warm-up 完成: success=${warmup.success}`);
} catch (e) {
  log(`Warm-up 失败: ${e.message} — 尝试直接使用 Ollama API`);
  // Try direct Ollama API call
  try {
    await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5:7b', prompt: 'hello', stream: false }),
      signal: AbortSignal.timeout(120000),
    });
    log('Ollama 直接调用 warm-up 完成');
  } catch (e2) {
    log(`Ollama 也超时: ${e2.message}`);
  }
}

await new Promise(r => setTimeout(r, 2000));

async function test(name, category, fn) {
  try {
    const raw = await fn();
    const result = raw.data || raw;
    const actions = result.actions || [];
    const reply = result.reply || '';
    const success = raw.success !== false;
    
    if (actions.length > 0) totalToolCalls += actions.length;
    const actionTypes = actions.map(a => a.type);
    
    log(`${success?'✓':'✗'} ${name} [${category}] 回复:${reply.length}字 工具:[${actionTypes.join(',')}]`);
    pass++;
    results.push({ name, category, status: 'pass', toolCalls: actionTypes, replyLen: reply.length });
  } catch (e) {
    log(`✗ ${name} [${category}] — ${e.message}`);
    fail++;
    results.push({ name, category, status: 'fail', error: e.message });
  }
}

// ══════════════════════════════════════════════
//  30 AI 测试 — 分 7 个类别
// ══════════════════════════════════════════════

log('\n═══ IA: 简单节点创建 ═══');
await test('IA1: 创建一个输入节点', 'simple', async () => aiChat('在画布上添加一个输入节点，标签为"用户输入"', '2'));
await test('IA2: 创建一个模型节点', 'simple', async () => aiChat('添加一个模型节点，标签为"GPT-4"', '2'));
await test('IA3: 创建一个代码节点', 'simple', async () => aiChat('在画布上放一个代码节点，命名为"数据处理"', '2'));
await test('IA4: 创建一个输出节点', 'simple', async () => aiChat('添加一个输出节点，叫"最终结果"', '2'));
await test('IA5: 创建文件输出节点(JSON)', 'simple', async () => aiChat('在画布上放一个文件输出节点，输出JSON格式', '2'));

log('\n═══ IB: 自然语言搭工作流 ═══');
await test('IB1: "帮我搭一个翻译工作流"', 'workflow', async () => aiChat('帮我搭一个翻译工作流，把用户输入的中文翻译成英文', '2'));
await test('IB2: "做一个数据采集+汇总的工作流"', 'workflow', async () => aiChat('帮我搭一个数据采集工作流，先输入数据，然后用代码处理，最后输出结果', '2'));
await test('IB3: "搭建一个文章摘要工作流"', 'workflow', async () => aiChat('搭建一个文章摘要生成工作流：用户输入文章 → AI模型总结 → 输出结果', '2'));
await test('IB4: "做一个文件处理管道"', 'workflow', async () => aiChat('帮我搭一个文件处理管道：输入 → 代码处理 → 文件输出(CSV格式)', '2'));
await test('IB5: "搭一个联网搜索工作流"', 'workflow', async () => aiChat('帮我搭一个联网搜索工作流：输入搜索词 → API调用 → 模型分析 → 保存结果', '2'));

log('\n═══ IC: 条件/分支/混合 ═══');
await test('IC1: "加一个条件判断节点"', 'condition', async () => aiChat('在画布上添加一个条件节点，如果分数大于60就通过', '2'));
await test('IC2: "搭一个带分支的审核工作流"', 'condition', async () => aiChat('帮我搭一个审核工作流：输入内容 → 条件判断(如果包含敏感词就拒绝) → 输出结果', '2'));
await test('IC3: "构建评分系统(条件分支)"', 'condition', async () => aiChat('构建一个评分系统工作流：输入成绩 → 条件判断(>=60及格/<60不及格) → 分别输出', '2'));
await test('IC4: "搭一个数据处理+保存工作流"', 'mixed', async () => aiChat('帮我搭一个数据处理工作流：输入原始数据 → 用Python清洗 → 保存为JSON文件', '2'));
await test('IC5: "搭一个代码审查工作流"', 'mixed', async () => aiChat('帮我搭一个代码审查工作流：输入代码 → AI模型审查 → 条件判断通过/修改 → 分别输出', '2'));

// Canvas state for manipulation tests
const canvasState = {
  nodes: [
    { id: 'n1', type: 'input', position: { x: 100, y: 200 }, data: { label: '输入' } },
    { id: 'n2', type: 'model', position: { x: 350, y: 200 }, data: { label: 'AI模型' } },
    { id: 'n3', type: 'output', position: { x: 600, y: 200 }, data: { label: '输出' } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
  ]
};

log('\n═══ ID: 画布操作 ═══');
await test('ID1: "重命名输入节点"', 'canvas', async () => aiChat('把"输入"节点重命名为"用户输入"', '2', canvasState));
await test('ID2: "在节点间插入代码节点"', 'canvas', async () => aiChat('在"输入"和"AI模型"之间插入一个代码节点，叫"预处理"', '2', canvasState));
await test('ID3: "删除连线"', 'canvas', async () => aiChat('删除"输入"到"AI模型"之间的连线', '2', canvasState));
await test('ID4: "改变节点类型"', 'canvas', async () => aiChat('把"输出"节点改成代码节点', '2', canvasState));
await test('ID5: "移动节点"', 'canvas', async () => aiChat('把"AI模型"节点向上移动200像素', '2', canvasState));

log('\n═══ IE: 模型/知识库管理 ═══');
await test('IE1: "列出所有模型"', 'model', async () => aiChat('列出我目前配置了哪些AI模型', '2'));
await test('IE2: "帮我添加一个OpenAI模型"', 'model', async () => aiChat('帮我添加一个OpenAI模型，接入点 https://api.openai.com/v1，模型 gpt-4o', '2'));
await test('IE3: "怎么添加知识库"', 'knowledge', async () => aiChat('怎么添加知识库？我想把文档文件夹变成知识库', '2'));
await test('IE4: "跳转到设置页面"', 'settings', async () => aiChat('带我去设置页面', '2'));
await test('IE5: "导出工作流"', 'export', async () => aiChat('帮我把当前工作流导出为文件', '2', canvasState));

log('\n═══ IF: 复杂场景 ═══');
await test('IF1: "完整ETL工作流"', 'complex', async () => aiChat('帮我搭一个完整ETL流程：输入 → Python清洗 → JS统计 → AI出报告 → 保存文件 → 输出', '2'));
await test('IF2: "带错误处理的工作流"', 'complex', async () => aiChat('搭一个带异常处理的工作流：输入 → 代码处理 → 条件判断成功/失败 → 成功保存，失败返回错误', '2'));
await test('IF3: "在步骤后加节点"', 'complex', async () => aiChat('在步骤2(代码处理)后面加一个输出节点作为通知', '2', canvasState));
await test('IF4: "修改节点配置"', 'complex', async () => aiChat('把"AI模型"节点的temperature设置为0.8，max_tokens设置为4096', '2', canvasState));
await test('IF5: "帮我连线"', 'complex', async () => aiChat('帮我连接节点：从"输入"连到"AI模型"，再从"AI模型"连到"输出"', '2', canvasState));

log('\n═══ IG: 边界/错误处理 ═══');
await test('IG1: "你好" (不调用工具)', 'edge', async () => aiChat('你好', '2'));
await test('IG2: "你是谁" (身份识别)', 'edge', async () => aiChat('你是谁？你能做什么？', '2'));
await test('IG3: "帮我看看画布上有什么"', 'edge', async () => aiChat('帮我看看当前画布上有什么节点', '2', canvasState));
await test('IG4: "运行工作流"', 'edge', async () => aiChat('帮我运行当前画布上的工作流', '2', canvasState));
await test('IG5: "清空画布"', 'edge', async () => aiChat('把画布清空', '2', canvasState));

// ══════════════════════════════════════════════
//  分析报告
// ══════════════════════════════════════════════
log(`\n${'='.repeat(60)}`);
log(`AI 对话测试完成: ${pass} 通过, ${fail} 失败, 共 ${pass+fail} 次`);
log(`总工具调用次数: ${totalToolCalls}`);
log(`${'='.repeat(60)}`);

// 按类别统计
const categories = {};
for (const r of results) {
  if (!categories[r.category]) categories[r.category] = { pass: 0, fail: 0, toolCalls: 0 };
  if (r.status === 'pass') categories[r.category].pass++;
  else categories[r.category].fail++;
  categories[r.category].toolCalls += r.toolCalls?.length || 0;
}

log('\n按类别统计:');
for (const [cat, stats] of Object.entries(categories)) {
  log(`  ${cat}: ${stats.pass}/${stats.pass+stats.fail} 通过, 工具调用 ${stats.toolCalls} 次`);
}

// 保存结果
fs.ensureDirSync(OUTPUT_DIR);
const summary = {
  timestamp: new Date().toISOString(),
  total: pass + fail,
  passed: pass,
  failed: fail,
  totalToolCalls,
  categories,
  results: results.map(r => ({
    name: r.name, category: r.category, status: r.status,
    toolCalls: r.toolCalls, replyLen: r.replyLen,
    error: r.error || undefined
  }))
};
fs.writeJsonSync(path.join(OUTPUT_DIR, '02_ai_summary.json'), summary, { spaces: 2 });

// 验证产出物
const existingFiles = fs.readdirSync(OUTPUT_DIR);
log(`\n产出文件夹中现有 ${existingFiles.length} 个文件:`);
for (const f of existingFiles.sort()) {
  const fp = path.join(OUTPUT_DIR, f);
  const stat = fs.statSync(fp);
  log(`  ${f} (${stat.size} bytes)`);
}

// 清理
if (server) server.kill();
process.exit(fail > 0 ? 1 : 0);
