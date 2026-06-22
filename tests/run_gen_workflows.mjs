/**
 * 运行生图 + 生视频工作流 → 验证产出 → 内置到数据库
 */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';

const BASE = 'http://localhost:3001';
let passed = 0, failed = 0;
function t(n,f){try{f();passed++;console.log(`  ✅ ${n}`)}catch(e){failed++;console.log(`  ❌ ${n}\n     ${e.message}`)}}
async function ta(n,f){try{await f();passed++;console.log(`  ✅ ${n}`)}catch(e){failed++;console.log(`  ❌ ${n}\n     ${e.message}`)}}

async function api(m, path, body, token) {
  const o = { method: m, headers: { 'Content-Type': 'application/json' } };
  if (token) o.headers['Authorization'] = `Bearer ${token}`;
  if (body) o.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, o);
  return { status: r.status, body: await r.json() };
}

// Login
const login = await api('POST', '/api/auth/login', { username: 'e2etest', password: 'e2etest123' });
const TOKEN = login.body.data?.token;
if (!TOKEN) { console.error('Login failed:', JSON.stringify(login.body)); process.exit(1); }
console.log('🔑 Logged in\n');

async function poll(execId, timeoutMs = 600000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await api('GET', `/api/executions/${execId}/status`, null, TOKEN);
    const s = r.body.data?.status;
    if (s === 'completed' || s === 'failed') return r.body.data;
    const logs = r.body.data?.logs || [];
    const info = logs.filter(l => l.message && !l.message.includes('review') && !l.message.includes('adapter') && !l.message.includes('debug'));
    if (info.length > 0) {
      const last = info[info.length - 1];
      console.log(`  [${s || 'running'}] ${last.message}`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('Timeout');
}

// ═══════════════ 1. 文生图 ═══════════════
console.log('═══════════════════════════════════════');
console.log('🎨 1. 文生图工作流');
console.log('═══════════════════════════════════════\n');

const imgCode = [
  'import json, sys, subprocess, os',
  'data = json.loads(sys.stdin.read())',
  'prompt = data.get("prompt") or data.get("input") or "beautiful landscape"',
  'script = os.path.join(os.getcwd(), "generate_fast.py")',
  'if not os.path.exists(script):',
  '    result = {"error": "generate_fast.py not found"}',
  'else:',
  '    try:',
  '        r = subprocess.run([sys.executable, script, prompt], capture_output=True, text=True, timeout=300, encoding="utf-8", errors="replace")',
  '        out = r.stdout or ""',
  '        marker = "[RESULT]"',
  '        idx = out.find(marker)',
  '        if idx >= 0:',
  '            result = json.loads(out[idx + len(marker):].strip())',
  '        else:',
  '            result = {"output": out[-500:], "stderr": (r.stderr or "")[-500:]}',
  '    except Exception as e:',
  '        result = {"error": str(e)}',
  'print(json.dumps(result))',
].join('\n');

const imgPrompt = 'Broly Super Saiyan 4, green hair, muscular, anime style, dragon ball, high quality';
console.log(`Prompt: ${imgPrompt}`);
console.log('提交生图任务...');
const imgRun = await api('POST', '/api/workflows/run', {
  nodes: [
    { id: 'n1', type: 'input', data: { label: 'Prompt', config: { input: imgPrompt } } },
    { id: 'n2', type: 'code', data: { label: 'Generate Image', config: { language: 'python', code: imgCode, timeout: 300000 } } },
    { id: 'n3', type: 'file_output', data: { label: 'Save Image', config: { format: 'json', fileName: `gen_${Date.now()}`, outputDir: 'output' } } },
    { id: 'n4', type: 'output', data: { label: 'Result' } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
  ],
  options: { mode: 'auto' },
}, TOKEN);

if (!imgRun.body.success) { console.error('提交失败:', imgRun.body.error); process.exit(1); }
console.log(`⏳ 执行中 (${imgRun.body.data.execution_id})...`);
const imgResult = await poll(imgRun.body.data.execution_id);
console.log(`状态: ${imgResult.status}`);

ta('生图完成', () => assert.strictEqual(imgResult.status, 'completed'));

const imgOut = imgResult.output_files?.find(f => f.nodeId === 'n2');
const imgData = imgOut ? JSON.parse(imgOut.content) : null;
console.log('\n📷 产出:');
if (imgData?.filePath) {
  const exists = fs.existsSync(imgData.filePath);
  console.log(`  文件: ${imgData.filePath}`);
  console.log(`  大小: ${(imgData.size/1024).toFixed(1)} KB`);
  console.log(`  格式: ${imgData.format || 'png'}`);
  console.log(`  存在: ${exists ? '✅' : '❌'}`);
  if (exists) {
    const stat = fs.statSync(imgData.filePath);
    console.log(`  实际: ${(stat.size/1024).toFixed(1)} KB`);
  }
} else {
  console.log(`  原始: ${JSON.stringify(imgData).slice(0, 300)}`);
}

// ═══════════════ 2. 文生视频 ═══════════════
console.log('\n═══════════════════════════════════════');
console.log('🎬 2. 文生视频工作流 (10帧)');
console.log('═══════════════════════════════════════\n');

const vidCode = [
  'import json, sys, subprocess, os',
  'data = json.loads(sys.stdin.read())',
  'prompt = data.get("prompt") or data.get("input") or "default scene"',
  'script = os.path.join(os.getcwd(), "generate_video_fast.py")',
  'if not os.path.exists(script):',
  '    result = {"error": "generate_video_fast.py not found"}',
  'else:',
  '    try:',
  '        r = subprocess.run([sys.executable, script, prompt, "", "10", "8"], capture_output=True, text=True, timeout=600, encoding="utf-8", errors="replace")',
  '        out = r.stdout or ""',
  '        marker = "[RESULT]"',
  '        idx = out.find(marker)',
  '        if idx >= 0:',
  '            result = json.loads(out[idx + len(marker):].strip())',
  '        else:',
  '            result = {"output": out[-500:], "stderr": (r.stderr or "")[-500:]}',
  '    except Exception as e:',
  '        result = {"error": str(e)}',
  'print(json.dumps(result))',
].join('\n');

const vidPrompt = 'Broly Super Saiyan 4, green hair, muscular, anime, dragon ball, aura explosion';
console.log(`Prompt: ${vidPrompt}`);
console.log('提交生视频任务...');
const vidRun = await api('POST', '/api/workflows/run', {
  nodes: [
    { id: 'v1', type: 'input', data: { label: 'Video Prompt', config: { input: vidPrompt } } },
    { id: 'v2', type: 'code', data: { label: 'Generate Video', config: { language: 'python', code: vidCode, timeout: 600000 } } },
    { id: 'v3', type: 'file_output', data: { label: 'Save Video', config: { format: 'json', fileName: `vid_${Date.now()}`, outputDir: 'output' } } },
    { id: 'v4', type: 'output', data: { label: 'Video Result' } },
  ],
  edges: [
    { id: 've1', source: 'v1', target: 'v2' },
    { id: 've2', source: 'v2', target: 'v3' },
    { id: 've3', source: 'v3', target: 'v4' },
  ],
  options: { mode: 'auto' },
}, TOKEN);

if (!vidRun.body.success) { console.error('提交失败:', vidRun.body.error); process.exit(1); }
console.log(`⏳ 执行中 (${vidRun.body.data.execution_id})...`);
const vidResult = await poll(vidRun.body.data.execution_id);
console.log(`状态: ${vidResult.status}`);

ta('生视频完成', () => assert.strictEqual(vidResult.status, 'completed'));

const vidOut = vidResult.output_files?.find(f => f.nodeId === 'v2');
const vidData = vidOut ? JSON.parse(vidOut.content) : null;
console.log('\n🎬 产出:');
if (vidData?.filePath) {
  const exists = fs.existsSync(vidData.filePath);
  console.log(`  文件: ${vidData.filePath}`);
  console.log(`  大小: ${(vidData.size/1024).toFixed(1)} KB`);
  console.log(`  格式: ${vidData.format || 'mp4'}`);
  console.log(`  帧数: ${vidData.frames || 'N/A'}`);
  console.log(`  FPS:  ${vidData.fps || 'N/A'}`);
  console.log(`  时长: ${vidData.duration ? vidData.duration.toFixed(1)+'s' : 'N/A'}`);
  console.log(`  存在: ${exists ? '✅' : '❌'}`);
} else {
  console.log(`  原始: ${JSON.stringify(vidData).slice(0, 300)}`);
}

// ═══════════════ 3. 内置 ═══════════════
console.log('\n═══════════════════════════════════════');
console.log('📦 3. 内置到数据库');
console.log('═══════════════════════════════════════\n');

const wfList = await api('GET', '/api/workflows', null, TOKEN);
for (const wf of (wfList.body.data || [])) {
  if (['文生图工作流', '文生视频工作流'].includes(wf.name)) {
    await api('DELETE', `/api/workflows/${wf.id}`, null, TOKEN);
    console.log(`  🗑️  删除旧: ${wf.name}`);
  }
}

const imgWf = await api('POST', '/api/workflows', {
  name: '文生图工作流',
  nodes: [
    { id: 'n1', type: 'input', position: { x: 80, y: 220 }, data: { label: 'Prompt', config: { input: 'Broly Super Saiyan 4, green hair, muscular, anime style, high quality' } } },
    { id: 'n2', type: 'code', position: { x: 380, y: 220 }, data: { label: 'Generate Image', config: { language: 'python', code: imgCode, timeout: 300000 } } },
    { id: 'n3', type: 'file_output', position: { x: 700, y: 220 }, data: { label: 'Save Image', config: { format: 'json', fileName: 'gen_result', outputDir: 'output' } } },
    { id: 'n4', type: 'output', position: { x: 920, y: 220 }, data: { label: 'Result' } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
  ],
}, TOKEN);
ta('文生图工作流已内置', () => { assert.ok(imgWf.body.success, imgWf.body.error); console.log(`  ID: ${imgWf.body.data.id}`); });

const vidWf = await api('POST', '/api/workflows', {
  name: '文生视频工作流',
  nodes: [
    { id: 'v1', type: 'input', position: { x: 80, y: 220 }, data: { label: 'Video Prompt', config: { input: 'Broly SS4, green hair, muscular, anime' } } },
    { id: 'v2', type: 'code', position: { x: 380, y: 220 }, data: { label: 'Generate Video', config: { language: 'python', code: vidCode, timeout: 600000 } } },
    { id: 'v3', type: 'file_output', position: { x: 700, y: 220 }, data: { label: 'Save Video', config: { format: 'json', fileName: 'vid_result', outputDir: 'output' } } },
    { id: 'v4', type: 'output', position: { x: 920, y: 220 }, data: { label: 'Video Result' } },
  ],
  edges: [
    { id: 've1', source: 'v1', target: 'v2' },
    { id: 've2', source: 'v2', target: 'v3' },
    { id: 've3', source: 'v3', target: 'v4' },
  ],
}, TOKEN);
ta('文生视频工作流已内置', () => { assert.ok(vidWf.body.success, vidWf.body.error); console.log(`  ID: ${vidWf.body.data.id}`); });

// ═══════════════ Summary ═══════════════
console.log(`\n${'='.repeat(55)}`);
console.log(`  结果: ${passed} 通过, ${failed} 失败`);
console.log(`${'='.repeat(55)}`);

console.log('\n📋 产出文件:');
if (imgData?.filePath) console.log(`  🖼️  ${imgData.filePath}`);
if (vidData?.filePath) console.log(`  🎬  ${vidData.filePath}`);

console.log('\n📋 内置工作流 (说「加载文生图/文生视频工作流」即还原):');
console.log(`  🎨 文生图工作流   ID=${imgWf.body.data?.id}`);
console.log(`  🎬 文生视频工作流 ID=${vidWf.body.data?.id}`);

if (failed > 0) process.exit(1);
