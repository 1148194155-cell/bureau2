// Comprehensive test suite ? starts server, runs all node types, verifies results
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'fs-extra';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3090;
const BASE = `http://localhost:${PORT}/api`;
const H = { 'Content-Type': 'application/json', 'X-User-Id': '1' };

let server = null;
let pass = 0;
let fail = 0;

process.on('exit', () => { if (fail > 0) process.exitCode = 1; });

async function api(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { headers: H, ...opts });
  return r.json();
}

async function awaitCompleted(execId, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await api(`/executions/${execId}/status`);
    if (r.data?.status === 'completed') return r.data;
    if (r.data?.status === 'failed') throw new Error('execution failed: ' + (r.data.error || ''));
    await new Promise(rr => setTimeout(rr, 500));
  }
  throw new Error('timed out waiting for execution');
}

async function test(name, fn) {
  try { await fn(); console.log(`  ? ${name}`); pass++; }
  catch (e) { console.log(`  ? ${name} - ${e.message}`); fail++; }
}

// ?? Start server ??
console.log('\n--- Starting server ---');
const indexPath = path.join(ROOT, 'src', 'index.js');
server = spawn('node', [indexPath], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', LC_DISABLE_AUTH: '1' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
server.stderr.on('data', d => process.stderr.write(`  [srv] ${d}`));
server.stdout.on('data', d => {
  const s = d.toString();
  process.stdout.write(`  [srv] ${s}`);
  if (s.includes('REST API') || s.includes('Health')) serverReady();
});

let readyResolve;
const readyPromise = new Promise(r => readyResolve = r);
function serverReady() { readyResolve(); }

await readyPromise;

// ?? Tests ??

// 1. health
await test('health', async () => {
  const r = await api('/health');
  if (r.status !== 'ok') throw new Error('health failed');
});

// 2. Auth (must run before any workflow tests)
await test('auth register+login', async () => {
  const ts = Date.now();
  let r = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username: 'test_' + ts, password: 'pass1234' }) });
  if (!r.success) throw new Error('register: ' + r.error);
  r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'test_' + ts, password: 'pass1234' }) });
  if (!r.success || !r.data?.token) throw new Error('login: ' + (r.error || 'no token'));
  H['Authorization'] = 'Bearer ' + r.data.token;
  r = await fetch(`${BASE}/auth/me`, { headers: { ...H, 'Authorization': 'Bearer ' + r.data.token } }).then(r => r.json());
  if (!r.success) throw new Error('me: ' + r.error);
});

// 3. simple workflow
await test('simple workflow', async () => {
  const r = await api('/workflows/run', {
    method: 'POST',
    body: JSON.stringify({
      nodes: [
        { id: 'n1', type: 'input', position: { x: 0, y: 0 }, data: { label: 'Input', input: { text: 'hello world' } } },
        { id: 'n2', type: 'output', position: { x: 200, y: 0 }, data: { label: 'Output' } },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      options: {}
    })
  });
  if (!r.success) throw new Error(r.error);
  const s = await awaitCompleted(r.data.execution_id);
  if (s.status !== 'completed') throw new Error(s.status);
});

// 4. code node
await test('code node', async () => {
  const r = await api('/workflows/run', {
    method: 'POST',
    body: JSON.stringify({
      nodes: [
        { id: 'in', type: 'input', position: { x: 100, y: 200 }, data: { label: 'In', input: { x: 3, y: 4 } } },
        { id: 'code', type: 'code', position: { x: 300, y: 200 }, data: { label: 'Code', config: { language: 'python', code: 'x = int(str(input_data.get("x", 0))) + int(str(input_data.get("y", 0))); print(x)' } } },
        { id: 'out', type: 'output', position: { x: 500, y: 200 }, data: { label: 'Out' } },
      ],
      edges: [{ id: 'e1', source: 'in', target: 'code' }, { id: 'e2', source: 'code', target: 'out' }],
      options: {}
    })
  });
  if (!r.success) throw new Error(r.error);
  const s = await awaitCompleted(r.data.execution_id);
  if (s.status !== 'completed') throw new Error(s.status);
});

// 5. condition true
await test('condition true', async () => {
  const r = await api('/workflows/run', {
    method: 'POST',
    body: JSON.stringify({
      nodes: [
        { id: 'in', type: 'input', position: { x: 100, y: 200 }, data: { label: 'In', input: { test: 'pass' } } },
        { id: 'c', type: 'condition', position: { x: 300, y: 100 }, data: { label: 'Cond', config: { expression: 'input.test === "pass"' }, trueBranch: 'yes', falseBranch: 'no' } },
        { id: 'yes', type: 'output', position: { x: 550, y: 100 }, data: { label: 'Yes' } },
        { id: 'no', type: 'output', position: { x: 550, y: 300 }, data: { label: 'No' } },
      ],
      edges: [{ id: 'e1', source: 'in', target: 'c' }, { id: 'e2', source: 'c', target: 'yes', edgeType: 'true' }, { id: 'e3', source: 'c', target: 'no', edgeType: 'false' }],
      options: {}
    })
  });
  if (!r.success) throw new Error(r.error);
  const s = await awaitCompleted(r.data.execution_id);
  if (s.status !== 'completed') throw new Error(s.status);
});

// 6. file output json
await test('file output json', async () => {
  const tmpDir = path.join(ROOT, 'output', 'test_json_' + Date.now());
  fs.ensureDirSync(tmpDir);
  const filePath = path.join(tmpDir, 'result.json').replace(/\\/g, '/');
  const code = `import os, json; p = r"${filePath}"; os.makedirs(os.path.dirname(p), exist_ok=True); json.dump({"test": True}, open(p, "w")); print("done")`;
  const r = await api('/workflows/run', {
    method: 'POST',
    body: JSON.stringify({
      nodes: [
        { id: 'code', type: 'code', position: { x: 300, y: 200 }, data: { label: 'Writer', config: { language: 'python', code } } },
        { id: 'out', type: 'output', position: { x: 500, y: 200 }, data: { label: 'Out' } },
      ],
      edges: [{ id: 'e1', source: 'code', target: 'out' }],
      options: {}
    })
  });
  if (!r.success) throw new Error(r.error);
  const s = await awaitCompleted(r.data.execution_id);
  if (s.status !== 'completed') throw new Error(s.status);
  if (!fs.existsSync(filePath)) throw new Error('output file was not created: ' + filePath);
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(fileContent);
  if (!parsed.test) throw new Error('missing data in output file');
  fs.removeSync(tmpDir);
});

// 7. 50-node chain
await test('50-node chain', async () => {
  const nodes = [];
  const edges = [];
  nodes.push({ id: 'i', type: 'input', position: { x: 50, y: 200 }, data: { label: 'In', input: { step: 0 } } });
  for (let i = 0; i < 49; i++) {
    nodes.push({ id: 'n' + i, type: 'code', position: { x: 150 + i * 100, y: 200 }, data: { label: 'Step' + i, config: { language: 'python', code: 'step = int(str(input_data.get("step", 0))) + 1; print(step)' } } });
    edges.push({ id: 'e' + i, source: i === 0 ? 'i' : 'n' + (i - 1), target: 'n' + i });
  }
  nodes.push({ id: 'o', type: 'output', position: { x: 150 + 49 * 100, y: 200 }, data: { label: 'Out' } });
  edges.push({ id: 'e49', source: 'n48', target: 'o' });
  const r = await api('/workflows/run', { method: 'POST', body: JSON.stringify({ nodes, edges, options: {} }) });
  if (!r.success) throw new Error(r.error);
  const s = await awaitCompleted(r.data.execution_id, 60000);
  if (s.status !== 'completed') throw new Error(s.status);
});

// 8. cycle rejection
await test('cycle rejection', async () => {
  const d = await api('/workflows/run', {
    method: 'POST',
    body: JSON.stringify({
      nodes: [{ id: 'a', type: 'output', position: { x: 100, y: 200 }, data: { label: 'a' } },
              { id: 'b', type: 'output', position: { x: 400, y: 200 }, data: { label: 'b' } }],
      edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'a' }],
      options: {}
    })
  });
  if (d.success) throw new Error('should have been rejected');
  if (!d.review || d.review.status !== 'fail') throw new Error('expected review fail, got: ' + JSON.stringify(d).slice(0, 100));
});

// 9. Webhook trigger
await test('webhook', async () => {
  const r = await api('/webhook/test_webhook', { method: 'POST', body: JSON.stringify({ test: true, ts: Date.now() }) });
  if (!r.success) throw new Error(r.error);
  const s = await awaitCompleted(r.data.execution_id);
  if (s.status !== 'completed') throw new Error(s.status);
});

// 10. Step mode
await test('step mode', async () => {
  const r = await api('/workflows/run', {
    method: 'POST',
    body: JSON.stringify({
      nodes: [{ id: 's', type: 'input', position: { x: 100, y: 200 }, data: { label: 's', input: 'step' } },
              { id: 'a', type: 'output', position: { x: 400, y: 200 }, data: { label: 'a' } }],
      edges: [{ id: 'e1', source: 's', target: 'a' }],
      options: {},
      mode: 'step'
    })
  });
  if (!r.success) throw new Error(r.error);
  await new Promise(r => setTimeout(r, 500));
  const s1 = await api(`/executions/${r.data.execution_id}/step`, { method: 'POST', body: JSON.stringify({ action: 'continue' }) });
  if (!s1.success) throw new Error('step1: ' + s1.error);
});

// 11. Execution history
await test('execution history', async () => {
  const r = await api('/executions/history/1');
  if (!r.success) throw new Error(r.error);
});

// 12. Schedule CRUD
await test('schedule crud', async () => {
  let r = await api('/workflows', { method: 'POST', body: JSON.stringify({ name: 'sched_test', nodes: [], edges: [] }) });
  if (!r.success) throw new Error('create wf: ' + r.error);
  r = await api('/schedules', { method: 'POST', body: JSON.stringify({ workflow_id: r.data.id, cron_expression: '0 0 * * *', enabled: false }) });
  if (!r.success) throw new Error('create sched: ' + r.error);
  await api(`/schedules/${r.data.id}`, { method: 'DELETE' });
});

// 13. Models list
await test('models list', async () => {
  const r = await api('/models');
  if (!r.success) throw new Error(r.error);
});

// 14. Skills list
await test('skills list', async () => {
  const r = await api('/skills');
  if (!r.success) throw new Error(r.error);
});

// ?? Summary ??
console.log(`\n???????????????????????????`);
console.log(`  PASS: ${pass} / ${pass + fail}`);
console.log(`  FAIL: ${fail} / ${pass + fail}`);
console.log(`???????????????????????????`);

// Cleanup
if (server) { server.kill(); }
if (fail > 0) process.exitCode = 1;
