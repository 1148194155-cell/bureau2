/**
 * 30 工作流全面测试 — 覆盖所有节点类型、连线模式、工作流拓扑
 *
 * 测试分类:
 *   A1-A5: 线性链 (各种节点类型组合)
 *   B1-B5: 分支/条件
 *   C1-C5: 多输入合并
 *   D1-D5: 文件输出 + 格式多样性
 *   E1-E5: 代码节点 (JS/Python) + API
 *   F1-F5: 复杂拓扑 + 错误处理
 *   G1-G5: 工作流子流程 + 超大节点链
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3091;
const BASE = `http://localhost:${PORT}/api`;
const H = { 'Content-Type': 'application/json', 'X-User-Id': '1' };
const OUTPUT_DIR = path.resolve(ROOT, '工作流产出');

let pass = 0, fail = 0;
const results = [];

function log(msg) { process.stdout.write(`  ${msg}\n`); }

async function api(path_, opts = {}) {
  const r = await fetch(`${BASE}${path_}`, { headers: H, ...opts });
  return r.json();
}

async function awaitCompleted(execId, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await api(`/executions/${execId}/status`);
    if (r.data?.status === 'completed') {
      // Fetch execution logs
      const logs = r.data.logs || [];
      return { status: 'completed', logs, results: r.data.results || [] };
    }
    if (r.data?.status === 'failed') {
      const logs = r.data.logs || [];
      return { status: 'failed', error: r.data.error || '', logs };
    }
    await new Promise(rr => setTimeout(rr, 500));
  }
  return { status: 'timeout' };
}

async function test(name, fn) {
  try {
    const r = await fn();
    if (r && r.status === 'failed') {
      log(`✗ ${name} — ${r.error || '执行失败'}`);
      fail++;
      results.push({ name, status: 'fail', error: r.error, details: r });
    } else {
      log(`✓ ${name}`);
      pass++;
      results.push({ name, status: 'pass', details: r });
    }
  } catch (e) {
    log(`✗ ${name} — ${e.message}`);
    fail++;
    results.push({ name, status: 'fail', error: e.message });
  }
}

// ── 启动服务器 ──
log('\n=== 启动测试服务器 ===');
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
server.stderr.on('data', d => process.stderr.write(`  [srv] ${d}`));
await readyPromise;
log('服务器已启动');

// ── 创建输出目录 ──
fs.ensureDirSync(OUTPUT_DIR);

// ── 工具函数 ──
function inputNode(id, label, inputData) {
  return { id, type: 'input', position: { x: 50, y: 200 }, data: { label: label || 'Input', input: inputData || { text: 'test data' } } };
}

function outputNode(id, label) {
  return { id, type: 'output', position: { x: 800, y: 200 }, data: { label: label || 'Output' } };
}

function codeNode(id, label, code, lang = 'python') {
  return { id, type: 'code', position: { x: 300, y: 200 }, data: { label: label || 'Code', config: { language: lang, code } } };
}

function conditionNode(id, label, expr) {
  return { id, type: 'condition', position: { x: 300, y: 100 }, data: { label: label || 'Cond', config: { expression: expr } } };
}

function fileOutputNode(id, label, format, fileName) {
  return { id, type: 'file_output', position: { x: 500, y: 200 }, data: { label: label || 'File', config: { format: format || 'json', fileName: fileName || 'output' } } };
}

function modelNode(id, label, prompt) {
  return { id, type: 'model', position: { x: 300, y: 200 }, data: { label: label || 'Model', config: { prompt: prompt || 'Analyze the input: {{input}}', modelId: 'builtin' } } };
}

function createEdge(id, source, target, opts = {}) {
  return { id, source, target, ...opts };
}

function makeWorkflowDef(nodes, edges) {
  return { nodes, edges, options: { outputDir: OUTPUT_DIR } };
}

// ── 辅助: 接收 workflow 执行 ──
async function runAndWait(name, nodes, edges, timeoutMs = 60000) {
  const def = makeWorkflowDef(nodes, edges);
  const r = await api('/workflows/run', { method: 'POST', body: JSON.stringify(def) });
  if (!r.success) throw new Error(r.error || 'API error');
  return await awaitCompleted(r.data.execution_id, timeoutMs);
}

// ═══════════════════════════════════════════════
//  SECTION A: 线性链 (Linear Chains)
// ═══════════════════════════════════════════════

log('\n═══ A: 线性链 ═══');

// A1: 最简单的 2 节点链 (input → output)
await test('A1: 2节点线性链 (input→output)', async () => {
  const r = await runAndWait('A1', [
    inputNode('a1_in', '输入', { text: 'hello linear chain' }),
    outputNode('a1_out', '输出'),
  ], [createEdge('a1_e', 'a1_in', 'a1_out')]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// A2: 3节点链 (input → code → output)
await test('A2: 3节点链 (input→code→output)', async () => {
  const r = await runAndWait('A2', [
    inputNode('a2_in', '输入', { value: 42, text: 'transform me' }),
    codeNode('a2_code', '处理', 'result = {"original": str(input_data.get("text", "")), "doubled": int(str(input_data.get("value", 0))) * 2, "processed": True}; import json; print(json.dumps(result))'),
    outputNode('a2_out', '输出'),
  ], [createEdge('a2_e1', 'a2_in', 'a2_code'), createEdge('a2_e2', 'a2_code', 'a2_out')]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// A3: 4节点链 (input → code → file_output → output)
await test('A3: 4节点链含文件输出', async () => {
  const r = await runAndWait('A3', [
    inputNode('a3_in', '输入', { data: [1,2,3,4,5], label: 'numbers' }),
    codeNode('a3_code', '统计', 'import json; d = input_data.get("data", []); result = {"sum": sum(d), "avg": sum(d)/len(d) if d else 0, "count": len(d), "label": input_data.get("label","")}; print(json.dumps(result))'),
    fileOutputNode('a3_file', '保存JSON', 'json', 'a3_stats_' + Date.now()),
    outputNode('a3_out', '输出'),
  ], [
    createEdge('a3_e1', 'a3_in', 'a3_code'),
    createEdge('a3_e2', 'a3_code', 'a3_file'),
    createEdge('a3_e3', 'a3_file', 'a3_out'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// A4: 5节点链 (input → code → code → file_output → output)
await test('A4: 5节点深链 (多步变换)', async () => {
  const r = await runAndWait('A4', [
    inputNode('a4_in', '输入', { text: 'Hello World from Local Canvas!' }),
    codeNode('a4_c1', '步骤1:反转', 'import json; t = str(input_data.get("text", "")); r = {"reversed": t[::-1], "length": len(t), "words": len(t.split())}; print(json.dumps(r))'),
    codeNode('a4_c2', '步骤2:格式化', "import json; d = json.loads(input_data.get('output','{}')) if isinstance(input_data.get('output'), str) else input_data; r = {'summary': f\"文本长度: {d.get('length',0)}, 单词数: {d.get('words',0)}, 反转后: {d.get('reversed','')}\", 'processed': True}; print(json.dumps(r))"),
    fileOutputNode('a4_file', '保存Markdown', 'md', 'a4_report_' + Date.now()),
    outputNode('a4_out', '最终输出'),
  ], [
    createEdge('a4_e1', 'a4_in', 'a4_c1'),
    createEdge('a4_e2', 'a4_c1', 'a4_c2'),
    createEdge('a4_e3', 'a4_c2', 'a4_file'),
    createEdge('a4_e4', 'a4_file', 'a4_out'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// A5: input → condition → 未满足分支 (true分支无后续节点)
await test('A5: 条件分支-假分支', async () => {
  const r = await runAndWait('A5', [
    inputNode('a5_in', '输入', { score: 50 }),
    conditionNode('a5_cond', '条件判断', 'input.score >= 100'),
    outputNode('a5_out', '结果'),
  ], [createEdge('a5_e1', 'a5_in', 'a5_cond'), createEdge('a5_e2', 'a5_cond', 'a5_out')]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// ═══════════════════════════════════════════════
//  SECTION B: 分支/条件 (Branching)
// ═══════════════════════════════════════════════

log('\n═══ B: 分支/条件 ═══');

// B1: 双分支 (true/false 各连一个输出)
await test('B1: 双分支条件', async () => {
  const r = await runAndWait('B1', [
    inputNode('b1_in', '输入', { x: 10, y: 20 }),
    conditionNode('b1_cond', '大于?', 'input.x > input.y'),
    outputNode('b1_true', '真分支'),
    outputNode('b1_false', '假分支'),
  ], [
    createEdge('b1_e1', 'b1_in', 'b1_cond'),
    createEdge('b1_e2', 'b1_cond', 'b1_true'),
    createEdge('b1_e3', 'b1_cond', 'b1_false'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// B2: 多条件分支 (条件→2个不同代码路径)
await test('B2: 条件分支到不同代码路径', async () => {
  const r = await runAndWait('B2', [
    inputNode('b2_in', '输入', { role: 'admin', action: 'delete' }),
    conditionNode('b2_cond', '权限检查', 'input.role === "admin"'),
    codeNode('b2_yes', '授权执行', 'import json; r = {"authorized": True, "action": str(input_data.get("action","")), "result": "executed"}; print(json.dumps(r))'),
    codeNode('b2_no', '拒绝访问', 'import json; r = {"authorized": False, "error": "permission denied", "action": str(input_data.get("action",""))}; print(json.dumps(r))'),
    outputNode('b2_out', '审计日志'),
  ], [
    createEdge('b2_e1', 'b2_in', 'b2_cond'),
    createEdge('b2_e2', 'b2_cond', 'b2_yes'),
    createEdge('b2_e3', 'b2_cond', 'b2_no'),
    createEdge('b2_e4', 'b2_yes', 'b2_out'),
    createEdge('b2_e5', 'b2_no', 'b2_out'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// B3: 嵌套条件
await test('B3: 序列条件', async () => {
  const r = await runAndWait('B3', [
    inputNode('b3_in', '输入', { temp: 30, humidity: 70 }),
    conditionNode('b3_c1', '温度检查', 'input.temp > 25'),
    codeNode('b3_hot', '高温处理', 'import json; r = {"zone": "hot", "temp": int(str(input_data.get("temp", 0))), "action": "cooling"}; print(json.dumps(r))'),
    conditionNode('b3_c2', '湿度检查', 'input.humidity > 60'),
    codeNode('b3_humid', '高湿处理', 'import json; r = {"zone": "humid", "action": "dehumidify", "humidity": int(str(input_data.get("humidity", 0)))}; print(json.dumps(r))'),
    outputNode('b3_out', '最终决策'),
  ], [
    createEdge('b3_e1', 'b3_in', 'b3_c1'),
    createEdge('b3_e2', 'b3_c1', 'b3_hot'),
    createEdge('b3_e3', 'b3_hot', 'b3_c2'),
    createEdge('b3_e4', 'b3_c2', 'b3_humid'),
    createEdge('b3_e5', 'b3_humid', 'b3_out'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// B4: 条件全假路径
await test('B4: 条件全部不满足', async () => {
  const r = await runAndWait('B4', [
    inputNode('b4_in', '输入', { value: 5 }),
    conditionNode('b4_c1', '>10?', 'input.value > 10'),
    conditionNode('b4_c2', '>20?', 'input.value > 20'),
    outputNode('b4_out', '结束'),
  ], [
    createEdge('b4_e1', 'b4_in', 'b4_c1'),
    createEdge('b4_e2', 'b4_c1', 'b4_c2'),
    createEdge('b4_e3', 'b4_c2', 'b4_out'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// B5: 单节点多输出分支 (code → 2个不同file_output)
await test('B5: 单源多目标分支', async () => {
  const r = await runAndWait('B5', [
    inputNode('b5_in', '输入', { name: 'test', data: { a: 1, b: 2, c: 3 } }),
    codeNode('b5_code', '数据拆分', 'import json; d = input_data.get("data", {}); summary = {"name": str(input_data.get("name","")), "keys": list(d.keys()), "values": list(d.values())}; detail = {"raw": d, "sum": sum(d.values()), "avg": sum(d.values())/len(d) if d else 0}; print(json.dumps({"summary": summary, "detail": detail}))'),
    fileOutputNode('b5_sum', '概要CSV', 'csv', 'b5_summary_' + Date.now()),
    fileOutputNode('b5_det', '详情JSON', 'json', 'b5_detail_' + Date.now()),
  ], [
    createEdge('b5_e1', 'b5_in', 'b5_code'),
    createEdge('b5_e2', 'b5_code', 'b5_sum'),
    createEdge('b5_e3', 'b5_code', 'b5_det'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// ═══════════════════════════════════════════════
//  SECTION C: 多输入合并 (Multi-input Merge)
// ═══════════════════════════════════════════════

log('\n═══ C: 多输入合并 ═══');

// C1: 两个输入合并到一个code节点
await test('C1: 2输入→1code', async () => {
  const r = await runAndWait('C1', [
    inputNode('c1_a', '输入A', { value: 'Hello' }),
    inputNode('c1_b', '输入B', { value: 'World' }),
    codeNode('c1_code', '合并', 'import json; a = str(input_data.get("value_a") or input_data.get("a_value") or input_data.get("c1_a",{}).get("value","")); b = str(input_data.get("value_b") or input_data.get("b_value") or input_data.get("c1_b",{}).get("value","") or "World"); r = {"combined": a + " " + b + "!"}; print(json.dumps(r))'),
    outputNode('c1_out', '输出'),
  ], [
    createEdge('c1_e1', 'c1_a', 'c1_code'),
    createEdge('c1_e2', 'c1_b', 'c1_code'),
    createEdge('c1_e3', 'c1_code', 'c1_out'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// C2: 3输入合并
await test('C2: 3输入→1code', async () => {
  const r = await runAndWait('C2', [
    inputNode('c2_a', '姓名', { name: '张三' }),
    inputNode('c2_b', '年龄', { age: 28 }),
    inputNode('c2_c', '城市', { city: '北京' }),
    codeNode('c2_code', '汇总', 'import json; profile = {}; for k in ["name","age","city"]: v = input_data.get(k, ""); profile[k] = v; r = {"profile": profile, "summary": f"{profile.get(\"name\",\"?\")} - {profile.get(\"age\",\"?\")}岁 - {profile.get(\"city\",\"?\")}"}; print(json.dumps(r))'),
    outputNode('c2_out', '个人信息'),
  ], [
    createEdge('c2_e1', 'c2_a', 'c2_code'),
    createEdge('c2_e2', 'c2_b', 'c2_code'),
    createEdge('c2_e3', 'c2_c', 'c2_code'),
    createEdge('c2_e4', 'c2_code', 'c2_out'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// C3: diamond 拓扑 (A→B→D, A→C→D)
await test('C3: 钻石拓扑 (菱形合并)', async () => {
  const r = await runAndWait('C3', [
    inputNode('c3_in', '输入', { text: 'diamond' }),
    codeNode('c3_b', '路径B', 'import json; r = {"path": "B", "upper": str(input_data.get("text","")).upper()}; print(json.dumps(r))'),
    codeNode('c3_c', '路径C', 'import json; r = {"path": "C", "lower": str(input_data.get("text","")).lower()}; print(json.dumps(r))'),
    codeNode('c3_d', '合并D', 'import json; r = {"from_b": input_data.get("output_b") or input_data.get("upper",""), "from_c": input_data.get("output_c") or input_data.get("lower",""), "combined": True}; print(json.dumps(r))'),
    outputNode('c3_out', '输出'),
  ], [
    createEdge('c3_e1', 'c3_in', 'c3_b'),
    createEdge('c3_e2', 'c3_in', 'c3_c'),
    createEdge('c3_e3', 'c3_b', 'c3_d'),
    createEdge('c3_e4', 'c3_c', 'c3_d'),
    createEdge('c3_e5', 'c3_d', 'c3_out'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// C4: 多input→多code交叉连线
await test('C4: 交叉连线 (2输入→2code→合并)', async () => {
  const r = await runAndWait('C4', [
    inputNode('c4_a', '数据A', { numbers: [1,2,3] }),
    inputNode('c4_b', '数据B', { numbers: [4,5,6] }),
    codeNode('c4_c1', '处理A', 'import json; nums = input_data.get("numbers", [1,2,3]); r = {"sum_a": sum(nums), "avg_a": sum(nums)/len(nums) if nums else 0}; print(json.dumps(r))'),
    codeNode('c4_c2', '处理B', 'import json; nums = input_data.get("numbers", [4,5,6]); r = {"sum_b": sum(nums), "avg_b": sum(nums)/len(nums) if nums else 0}; print(json.dumps(r))'),
    codeNode('c4_merge', '最终对比', 'import json; a = {k.replace("_a",""):v for k,v in input_data.items() if k.endswith("_a")}; b = {k.replace("_b",""):v for k,v in input_data.items() if k.endswith("_b")}; r = {"comparison": f"A总和={a.get(\"sum\",0)} vs B总和={b.get(\"sum\",0)}", "winner": "A" if a.get("sum",0) > b.get("sum",0) else "B"}; print(json.dumps(r))'),
    outputNode('c4_out', '对比结果'),
  ], [
    createEdge('c4_e1', 'c4_a', 'c4_c1'),
    createEdge('c4_e2', 'c4_b', 'c4_c2'),
    createEdge('c4_e3', 'c4_c1', 'c4_merge'),
    createEdge('c4_e4', 'c4_c2', 'c4_merge'),
    createEdge('c4_e5', 'c4_merge', 'c4_out'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// C5: fan-in 扇形汇聚 (5输入→1code)
await test('C5: 5输入扇入汇聚', async () => {
  const nodes = [];
  const edges = [];
  for (let i = 0; i < 5; i++) {
    nodes.push(inputNode(`c5_in${i}`, `输入${i+1}`, { val: i * 10 }));
    edges.push(createEdge(`c5_e${i}`, `c5_in${i}`, 'c5_code'));
  }
  nodes.push(codeNode('c5_code', '汇聚求和', 'import json; vals = []; for k,v in input_data.items(): vals.append(int(str(v)) if str(v).lstrip("-").isdigit() else 0); r = {"sum": sum(vals), "count": len(vals), "avg": sum(vals)/len(vals) if vals else 0}; print(json.dumps(r))'));
  nodes.push(outputNode('c5_out', '结果'));
  edges.push(createEdge('c5_e5', 'c5_code', 'c5_out'));

  const r = await runAndWait('C5', nodes, edges);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// ═══════════════════════════════════════════════
//  SECTION D: 文件输出 + 格式多样性
// ═══════════════════════════════════════════════

log('\n═══ D: 文件输出 + 格式多样性 ═══');

// D1: JSON格式输出
await test('D1: JSON格式文件输出', async () => {
  const r = await runAndWait('D1', [
    inputNode('d1_in', '输入', { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }], timestamp: Date.now() }),
    fileOutputNode('d1_file', 'JSON输出', 'json', 'd1_json_' + Date.now()),
  ], [createEdge('d1_e1', 'd1_in', 'd1_file')]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// D2: CSV格式输出
await test('D2: CSV格式文件输出', async () => {
  const r = await runAndWait('D2', [
    inputNode('d2_in', '输入', { data: [{ name: '产品A', price: 100, stock: 50 }, { name: '产品B', price: 200, stock: 30 }, { name: '产品C', price: 150, stock: 0 }] }),
    fileOutputNode('d2_file', 'CSV输出', 'csv', 'd2_inventory_' + Date.now()),
  ], [createEdge('d2_e1', 'd2_in', 'd2_file')]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// D3: Markdown格式输出
await test('D3: Markdown格式文件输出', async () => {
  const r = await runAndWait('D3', [
    inputNode('d3_in', '输入', { title: '工作报告', date: '2025-01-15', items: ['已完成A', '进行中B', '待开始C'] }),
    fileOutputNode('d3_file', 'MD输出', 'md', 'd3_report_' + Date.now()),
  ], [createEdge('d3_e1', 'd3_in', 'd3_file')]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// D4: HTML格式输出
await test('D4: HTML格式文件输出', async () => {
  const r = await runAndWait('D4', [
    inputNode('d4_in', '输入', { title: '仪表盘', metrics: { cpu: '45%', mem: '62%', disk: '78%' } }),
    fileOutputNode('d4_file', 'HTML输出', 'html', 'd4_dashboard_' + Date.now()),
  ], [createEdge('d4_e1', 'd4_in', 'd4_file')]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// D5: TXT + 模板渲染
await test('D5: TXT格式+代码生成后写出', async () => {
  const r = await runAndWait('D5', [
    inputNode('d5_in', '输入', { message: 'Hello', count: 3 }),
    codeNode('d5_code', '生成内容', 'import json; msg = str(input_data.get("message","Hello")); cnt = int(str(input_data.get("count","1"))); lines = [f"{i+1}. {msg} - {chr(65+i)}" for i in range(cnt)]; r = {"title": "Generated List", "lines": lines, "total": len(lines)}; print(json.dumps(r))'),
    fileOutputNode('d5_file', 'TXT输出', 'txt', 'd5_list_' + Date.now()),
  ], [
    createEdge('d5_e1', 'd5_in', 'd5_code'),
    createEdge('d5_e2', 'd5_code', 'd5_file'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// ═══════════════════════════════════════════════
//  SECTION E: 代码节点 (JS/Python) + API
// ═══════════════════════════════════════════════

log('\n═══ E: 代码节点 + API ═══');

// E1: JavaScript 代码节点
await test('E1: JavaScript代码节点', async () => {
  const r = await runAndWait('E1', [
    inputNode('e1_in', '输入JS', { x: 10, y: 20, items: [1,2,3] }),
    { id: 'e1_code', type: 'code', position: { x: 300, y: 200 }, data: { label: 'JS处理', config: { language: 'javascript', code: 'const arr = input.items || []; return { sum: input.x + input.y, max: Math.max(...arr), doubled: arr.map(x => x * 2), timestamp: new Date().toISOString() };' } } },
    outputNode('e1_out', 'JS结果'),
  ], [createEdge('e1_e1', 'e1_in', 'e1_code'), createEdge('e1_e2', 'e1_code', 'e1_out')]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// E2: Python 数据处理
await test('E2: Python复杂数据处理', async () => {
  const r = await runAndWait('E2', [
    inputNode('e2_in', '输入', { text: 'apple,banana,orange,grape,apple,banana,apple' }),
    codeNode('e2_code', '词频统计', 'import json, re; t = str(input_data.get("text","")); words = re.split(r"[,\\s]+", t); freq = {}; for w in words: w = w.strip().lower(); freq[w] = freq.get(w,0)+1; sorted_freq = dict(sorted(freq.items(), key=lambda x: -x[1])); r = {"frequencies": sorted_freq, "unique_words": len(freq), "total": sum(freq.values()), "top": list(sorted_freq.keys())[:3]}; print(json.dumps(r))'),
    outputNode('e2_out', '统计结果'),
  ], [createEdge('e2_e1', 'e2_in', 'e2_code'), createEdge('e2_e2', 'e2_code', 'e2_out')]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// E3: Fibonacci 序列生成
await test('E3: 算法代码节点 (Fibonacci)', async () => {
  const r = await runAndWait('E3', [
    inputNode('e3_in', '输入', { n: 15 }),
    codeNode('e3_code', '斐波那契', 'import json; n = int(str(input_data.get("n","10"))); fib = [0,1]; for i in range(2, n): fib.append(fib[-1] + fib[-2]); r = {"sequence": fib[:n], "length": n, "sum": sum(fib[:n]), "ratio": fib[-1]/fib[-2] if len(fib)>=2 and fib[-2]!=0 else 0}; print(json.dumps(r))'),
    outputNode('e3_out', '结果'),
  ], [createEdge('e3_e1', 'e3_in', 'e3_code'), createEdge('e3_e2', 'e3_code', 'e3_out')]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// E4: 排序算法
await test('E4: 排序算法代码节点', async () => {
  const r = await runAndWait('E4', [
    inputNode('e4_in', '输入', { unsorted: [64, 34, 25, 12, 22, 11, 90], order: 'desc' }),
    codeNode('e4_code', '排序', 'import json; nums = input_data.get("unsorted",[]); rev = str(input_data.get("order","asc")) == "desc"; sorted_nums = sorted(nums, reverse=rev); r = {"original": nums, "sorted": sorted_nums, "min": min(nums) if nums else 0, "max": max(nums) if nums else 0, "median": sorted_nums[len(sorted_nums)//2] if sorted_nums else 0}; print(json.dumps(r))'),
    outputNode('e4_out', '排序结果'),
  ], [createEdge('e4_e1', 'e4_in', 'e4_code'), createEdge('e4_e2', 'e4_code', 'e4_out')]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// E5: 空代码节点 + 错误处理 (node without data)
await test('E5: 空数据节点', async () => {
  // 测试空节点能否正常处理（应失败并跳过）
  const r = await runAndWait('E5', [
    { id: 'e5_empty', type: 'input', position: { x: 50, y: 200 }, data: {} },
    { id: 'e5_out', type: 'output', position: { x: 400, y: 200 }, data: { label: '空' } },
  ], [createEdge('e5_e1', 'e5_empty', 'e5_out')]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// ═══════════════════════════════════════════════
//  SECTION F: 复杂拓扑 + 错误处理
// ═══════════════════════════════════════════════

log('\n═══ F: 复杂拓扑 + 错误处理 ═══');

// F1: 10节点线性链（压力测试）
await test('F1: 10节点线性长链', async () => {
  const nodes = [inputNode('f1_in', '入口', { val: 1 })];
  const edges = [];
  for (let i = 0; i < 9; i++) {
    const prev = i === 0 ? 'f1_in' : `f1_n${i-1}`;
    const cur = `f1_n${i}`;
    nodes.push(codeNode(cur, `步${i+1}`, `import json; v = int(str(input_data.get("val","0") or "0")) + 1; r = {"val": v, "step": ${i+1}}; print(json.dumps(r))`));
    edges.push(createEdge(`f1_e${i}`, prev, cur));
  }
  nodes.push(outputNode('f1_out', '终点'));
  edges.push(createEdge('f1_e9', `f1_n8`, 'f1_out'));

  const r = await runAndWait('F1', nodes, edges, 120000);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// F2: 树形展开 (1→3→9)
await test('F2: 树形展开 (1分3再分3)', async () => {
  const nodes = [inputNode('f2_root', '根', { base: 'tree' })];
  const edges = [];
  const ids = ['f2_root'];
  const levels = [['f2_a','f2_b','f2_c'], ['f2_a1','f2_a2','f2_a3','f2_b1','f2_b2','f2_b3','f2_c1','f2_c2','f2_c3']];
  
  // Level 1
  for (let i = 0; i < 3; i++) {
    const id = levels[0][i];
    nodes.push(codeNode(id, `L1-${String.fromCharCode(65+i)}`, `import json; r = {"level": 1, "branch": "${String.fromCharCode(65+i)}", "data": str(input_data.get("base",""))}; print(json.dumps(r))`));
    edges.push(createEdge(`f2_e0_${i}`, 'f2_root', id));
  }
  // Level 2
  for (let i = 0; i < 9; i++) {
    const id = levels[1][i];
    const parent = levels[0][Math.floor(i / 3)];
    nodes.push(codeNode(id, `L2-${id}`, `import json; r = {"level": 2, "node": "${id}", "parent_data": str(input_data.get("data",""))}; print(json.dumps(r))`));
    edges.push(createEdge(`f2_e1_${i}`, parent, id));
  }
  nodes.push(outputNode('f2_out', '汇总'));
  for (const id of levels[1]) {
    edges.push(createEdge(`f2_e2_${id}`, id, 'f2_out'));
  }

  const r = await runAndWait('F2', nodes, edges, 120000);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// F3: 空工作流 (无节点)
await test('F3: 空工作流 (无节点)', async () => {
  const r = await api('/workflows/run', { method: 'POST', body: JSON.stringify({ nodes: [], edges: [], options: {} }) });
  // Empty workflow should fail with review validation
  if (r.success) throw new Error('空的 workflow 应该被拒绝');
  return { status: 'rejected', reason: r.error };
});

// F4: 自环检测
await test('F4: 自环检测 (单节点连自己)', async () => {
  const r = await api('/workflows/run', {
    method: 'POST',
    body: JSON.stringify({
      nodes: [{ id: 'f4_a', type: 'output', position: { x: 100, y: 200 }, data: { label: 'a' } }],
      edges: [{ id: 'f4_e1', source: 'f4_a', target: 'f4_a' }],
      options: {}
    })
  });
  if (r.success) throw new Error('自环应该被拒绝');
  return { status: 'rejected' };
});

// F5: 不连通图 (2个独立子图)
await test('F5: 不连通图 (2个独立子图)', async () => {
  // Two separate sub-graphs — should run both
  const r = await runAndWait('F5', [
    inputNode('f5_a', '图A-输入', { msg: 'from A' }),
    outputNode('f5_aout', '图A-输出'),
    inputNode('f5_b', '图B-输入', { msg: 'from B' }),
    outputNode('f5_bout', '图B-输出'),
  ], [
    createEdge('f5_ea', 'f5_a', 'f5_aout'),
    createEdge('f5_eb', 'f5_b', 'f5_bout'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// ═══════════════════════════════════════════════
//  SECTION G: 超大节点链 + 子流程
// ═══════════════════════════════════════════════

log('\n═══ G: 超大节点链 + 子流程 ═══');

// G1: 20节点链
await test('G1: 20节点长链', async () => {
  const nodes = [inputNode('g1_in', '起始', { val: 0 })];
  const edges = [];
  for (let i = 0; i < 19; i++) {
    const prev = i === 0 ? 'g1_in' : `g1_n${i-1}`;
    const cur = `g1_n${i}`;
    nodes.push(codeNode(cur, `N${i+1}`, `import json; v = int(str(input_data.get("val","0"))) + 1; r = {"val": v, "node": ${i+1}}; print(json.dumps(r))`));
    edges.push(createEdge(`g1_e${i}`, prev, cur));
  }
  nodes.push(outputNode('g1_out', '终点'));
  edges.push(createEdge('g1_e19', 'g1_n18', 'g1_out'));

  const r = await runAndWait('G1', nodes, edges, 180000);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// G2: 30节点简单链（边界测试）
await test('G2: 30节点长链', async () => {
  const nodes = [inputNode('g2_in', 'Start', { val: 0 })];
  const edges = [];
  for (let i = 0; i < 29; i++) {
    const prev = i === 0 ? 'g2_in' : `g2_n${i-1}`;
    const cur = `g2_n${i}`;
    nodes.push(codeNode(cur, `N${i+1}`, `import json; v = int(str(input_data.get("val","0"))) + 1; r = {"val": v}; print(json.dumps(r))`));
    edges.push(createEdge(`g2_e${i}`, prev, cur));
  }
  nodes.push(outputNode('g2_out', 'End'));
  edges.push(createEdge('g2_e29', 'g2_n28', 'g2_out'));

  const r = await runAndWait('G2', nodes, edges, 180000);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// G3: 条件+代码+文件输出混合复杂拓扑
await test('G3: 混合复杂拓扑 (条件+代码+文件)', async () => {
  const r = await runAndWait('G3', [
    inputNode('g3_in', '入口', { score: 85, name: '测试项目', items: ['功能A','功能B','功能C'] }),
    conditionNode('g3_c1', '评分检查', 'input.score >= 60'),
    codeNode('g3_pass', '通过处理', 'import json; r = {"result": "PASS", "score": int(str(input_data.get("score","0"))), "grade": "A" if int(str(input_data.get("score","0")))>=90 else "B" if int(str(input_data.get("score","0")))>=80 else "C"}; print(json.dumps(r))'),
    codeNode('g3_fail', '失败处理', 'import json; r = {"result": "FAIL", "score": int(str(input_data.get("score","0"))), "action": "review_required"}; print(json.dumps(r))'),
    fileOutputNode('g3_file', '输出JSON', 'json', 'g3_result_' + Date.now()),
    outputNode('g3_out', '最终'),
  ], [
    createEdge('g3_e1', 'g3_in', 'g3_c1'),
    createEdge('g3_e2', 'g3_c1', 'g3_pass'),
    createEdge('g3_e3', 'g3_c1', 'g3_fail'),
    createEdge('g3_e4', 'g3_pass', 'g3_file'),
    createEdge('g3_e5', 'g3_file', 'g3_out'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// G4: 管道模式 — 每个节点只做一件事
await test('G4: 管道模式 (5节点串行处理)', async () => {
  const r = await runAndWait('G4', [
    inputNode('g4_in', '原始数据', { text: '  Hello World!  ', count: 5 }),
    codeNode('g4_t1', '清洗', 'import json; t = str(input_data.get("text","")).strip(); r = {"text": t, "length": len(t)}; print(json.dumps(r))'),
    codeNode('g4_t2', '分词', 'import json; t = str(input_data.get("text","")); words = t.split(); r = {"words": words, "count": len(words)}; print(json.dumps(r))'),
    codeNode('g4_t3', '统计', 'import json; words = input_data.get("words",[]); freq = {}; for w in words: w = w.lower().replace(".","").replace("!",""); freq[w] = freq.get(w,0)+1; r = {"freq": freq, "unique": len(freq)}; print(json.dumps(r))'),
    fileOutputNode('g4_file', '输出JSON', 'json', 'g4_pipeline_' + Date.now()),
  ], [
    createEdge('g4_e1', 'g4_in', 'g4_t1'),
    createEdge('g4_e2', 'g4_t1', 'g4_t2'),
    createEdge('g4_e3', 'g4_t2', 'g4_t3'),
    createEdge('g4_e4', 'g4_t3', 'g4_file'),
  ]);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// G5: 超大扇入 (8输入汇聚)
await test('G5: 8输入汇聚+文件输出', async () => {
  const nodes = [];
  const edges = [];
  for (let i = 0; i < 8; i++) {
    nodes.push(inputNode(`g5_in${i}`, `源${i+1}`, { idx: i, letter: String.fromCharCode(65 + i) }));
    edges.push(createEdge(`g5_e${i}`, `g5_in${i}`, 'g5_code'));
  }
  nodes.push(codeNode('g5_code', '汇聚所有输入', 'import json; inputs = {}; for k,v in input_data.items(): inputs[k] = str(v)[:50]; r = {"all_inputs": inputs, "count": len(inputs), "letters": "".join(str(input_data.get(f"letter_{i}") or str(input_data.get(f"g5_in{i}",{})).split(",")[0] if str(input_data.get(f"g5_in{i}",{})).startswith("{") else "") for i in range(8))}'.replace('range(8)', 'range(8)')));
  nodes.push(fileOutputNode('g5_file', '汇聚输出', 'json', 'g5_fanin_' + Date.now()));
  edges.push(createEdge('g5_e8', 'g5_code', 'g5_file'));

  const r = await runAndWait('G5', nodes, edges, 120000);
  if (r.status !== 'completed') throw new Error(r.error || r.status);
  return r;
});

// ── 总结 ──
log(`\n${'='.repeat(50)}`);
log(`结果: ${pass} 通过, ${fail} 失败, 共 ${pass+fail} 个工作流测试`);
log(`${'='.repeat(50)}`);

// 保存结果到工作流产出
const summary = {
  timestamp: new Date().toISOString(),
  total: pass + fail,
  passed: pass,
  failed: fail,
  results: results,
};
fs.writeJsonSync(path.join(OUTPUT_DIR, '00_test_summary.json'), summary, { spaces: 2 });

// 列出产出文件
const files = fs.readdirSync(OUTPUT_DIR);
log('\n产出文件列表:');
for (const f of files.sort()) {
  const p = path.join(OUTPUT_DIR, f);
  const stat = fs.statSync(p);
  log(`  ${f} (${stat.size} bytes)`);
}

// 清理
if (server) server.kill();
process.exit(fail > 0 ? 1 : 0);
