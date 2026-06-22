/**
 * 画布工作流 全链路端到端测试
 * 覆盖前后端完整流程：input→code(py/js)→file_output→output 等所有链路
 */
import { strict as assert } from 'node:assert';

const BASE = 'http://localhost:3001';
const TOKEN = 'eyJ1aWQiOjM4LCJ1bmFtZSI6ImUyZXRlc3QiLCJleHAiOjE3ODI2MTQ5NjkxMTV9.CCSqeQLtw7EWWk9nAdv6o9FylDUAC5Dqccgjt6hLOKw';
const AUTH = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` };

let passed = 0;
let failed = 0;
function t(name, fn) { try { fn(); passed++; console.log(`  ✅ ${name}`); } catch(e) { failed++; console.log(`  ❌ ${name}\n     ${e.message}`); } }
async function ta(name, fn) { try { await fn(); passed++; console.log(`  ✅ ${name}`); } catch(e) { failed++; console.log(`  ❌ ${name}\n     ${e.message}`); } }

async function api(method, path, body) {
  const opts = { method, headers: { ...AUTH } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return { status: res.status, body: await res.json() };
}

async function poll(execId, timeoutMs=15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await api('GET', `/api/executions/${execId}/status`);
    const s = r.body.data?.status;
    if (s === 'completed' || s === 'failed') return r.body.data;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Timeout');
}

async function runWf(wf, timeoutMs=15000) {
  const r = await api('POST', '/api/workflows/run', { nodes: wf.nodes, edges: wf.edges, options: { mode: 'auto' } });
  if (!r.body.success) throw new Error(`Run: ${r.body.error}`);
  return poll(r.body.data.execution_id, timeoutMs);
}
function findOut(exec, nid) { return (exec.output_files||[]).find(f=>f.nodeId===nid); }
function parse(e) { if(!e) return null; try{return JSON.parse(e.content)}catch{return e.content} }

console.log('\n📦 1. 服务健康检查');
await ta('后端 health', async () => { const r = await api('GET', '/api/health'); assert.ok(r.status===200); });
await ta('前端 5173', async () => { const r = await fetch('http://127.0.0.1:5173'); assert.ok(r.status===200||r.status===304); });

console.log('\n📦 2. 预置风格 sys.stdin.read()');
await ta('自读 stdin workflow', async () => {
  const code = ['import json, sys','data = json.loads(sys.stdin.read())','prompt = data.get("input","")','result={"prompt":prompt,"len":len(prompt)}','print(json.dumps(result))'].join('\n');
  const exec = await runWf({
    nodes:[
      {id:'n1',type:'input',data:{label:'P',config:{input:'Broly SS4 green hair'}}},
      {id:'n2',type:'code',data:{label:'G',config:{language:'python',code}}},
      {id:'n3',type:'output',data:{label:'R'}},
    ],
    edges:[{id:'e1',source:'n1',target:'n2'},{id:'e2',source:'n2',target:'n3'}],
  });
  const out = parse(findOut(exec,'n2'));
  assert.strictEqual(out.prompt, 'Broly SS4 green hair');
  assert.strictEqual(out.len, 20);
});

console.log('\n📦 3. 前端风格 input_data 变量');
await ta('placeholder 模板', async () => {
  const code = ['# input_data 是上游数据','import json','text=input_data.get("input","")','result={"up":text.upper(),"len":len(text)}','print(json.dumps(result))'].join('\n');
  const exec = await runWf({
    nodes:[
      {id:'n1',type:'input',data:{config:{input:'hello canvas'}}},
      {id:'n2',type:'code',data:{label:'U',config:{language:'python',code}}},
      {id:'n3',type:'output',data:{label:'R'}},
    ],
    edges:[{id:'e1',source:'n1',target:'n2'},{id:'e2',source:'n2',target:'n3'}],
  });
  assert.strictEqual(parse(findOut(exec,'n2')).up, 'HELLO CANVAS');
  assert.strictEqual(parse(findOut(exec,'n2')).len, 12);
});

console.log('\n📦 4. JavaScript 代码节点');
await ta('input→js→output', async () => {
  const exec = await runWf({
    nodes:[
      {id:'n1',type:'input',data:{config:{input:'javascript test'}}},
      {id:'n2',type:'code',data:{label:'JS',config:{language:'javascript',code:'({ text: input.input.toUpperCase(), count: input.input.length })'}}},
      {id:'n3',type:'output',data:{label:'R'}},
    ],
    edges:[{id:'e1',source:'n1',target:'n2'},{id:'e2',source:'n2',target:'n3'}],
  });
  const o = parse(findOut(exec,'n2'));
  assert.strictEqual(o.text, 'JAVASCRIPT TEST');
  assert.strictEqual(o.count, 15);
});

console.log('\n📦 5. 链式: input→py→py→output');
await ta('多节点链式处理', async () => {
  const c1='import json\nt=input_data.get("input","")\nr={"step1":t[::-1]}\nprint(json.dumps(r))';
  const c2='import json\nt=input_data.get("step1","")\nr={"step2":t.upper()}\nprint(json.dumps(r))';
  const exec = await runWf({
    nodes:[
      {id:'n1',type:'input',data:{config:{input:'hello'}}},
      {id:'n2',type:'code',data:{label:'Rev',config:{language:'python',code:c1}}},
      {id:'n3',type:'code',data:{label:'Up',config:{language:'python',code:c2}}},
      {id:'n4',type:'output',data:{label:'R'}},
    ],
    edges:[{id:'e1',source:'n1',target:'n2'},{id:'e2',source:'n2',target:'n3'},{id:'e3',source:'n3',target:'n4'}],
  });
  assert.strictEqual(parse(findOut(exec,'n3')).step2, 'OLLEH');
});

console.log('\n📦 6. file_output 节点');
await ta('input→code→file_output→output', async () => {
  const code='import json\nt=input_data.get("input","")\nr={"o":t}\nprint(json.dumps(r))';
  const exec = await runWf({
    nodes:[
      {id:'n1',type:'input',data:{config:{input:'save me'}}},
      {id:'n2',type:'code',data:{label:'C',config:{language:'python',code}}},
      {id:'n3',type:'file_output',data:{label:'F',config:{format:'json',fileName:`e2e_${Date.now()}`,outputDir:'output'}}},
      {id:'n4',type:'output',data:{label:'R'}},
    ],
    edges:[{id:'e1',source:'n1',target:'n2'},{id:'e2',source:'n2',target:'n3'},{id:'e3',source:'n3',target:'n4'}],
  });
  const fo = findOut(exec,'n3');
  assert.ok(fo, 'file_output present');
  assert.ok(String(fo.content).includes('.json'), `path: ${fo.content}`);
});

console.log('\n📦 7. 错误处理');
await ta('Python除零→failed', async () => {
  const r = await api('POST', '/api/workflows/run', {
    nodes:[{id:'n1',type:'input',data:{config:{input:'t'}}},{id:'n2',type:'code',data:{label:'Bad',config:{language:'python',code:'x=1/0'}}}],
    edges:[{id:'e1',source:'n1',target:'n2'}], options:{mode:'auto'},
  });
  assert.ok(r.body.success, `accept: ${r.body.error||'ok'}`);
  const exec = await poll(r.body.data.execution_id, 10000);
  assert.strictEqual(exec.status, 'failed');
});

console.log('\n📦 8. 保存→ID执行');
await ta('save+run by id', async () => {
  const code='import json\nr={"echo":input_data.get("input","")}\nprint(json.dumps(r))';
  const save = await api('POST', '/api/workflows', {
    name:`e2e_${Date.now()}`,
    nodes:[{id:'n1',type:'input',data:{config:{input:'id-test-ok'}}},{id:'n2',type:'code',data:{label:'E',config:{language:'python',code}}},{id:'n3',type:'output',data:{label:'R'}}],
    edges:[{id:'e1',source:'n1',target:'n2'},{id:'e2',source:'n2',target:'n3'}],
  });
  assert.ok(save.body.success, `save: ${save.body.error||'ok'}`);
  const run = await api('POST', '/api/workflows/run', { workflow_id: save.body.data.id, options:{mode:'auto'} });
  assert.ok(run.body.success, `run: ${run.body.error||'ok'}`);
  const exec = await poll(run.body.data.execution_id, 10000);
  assert.strictEqual(parse(findOut(exec,'n2')).echo, 'id-test-ok');
});

console.log('\n📦 9. 并行分支');
await ta('input→[A,B]→output', async () => {
  const cA='import json\nt=input_data.get("input","")\nr={"br":"A","text":t}\nprint(json.dumps(r))';
  const cB='import json\nt=input_data.get("input","")\nr={"br":"B","len":len(t)}\nprint(json.dumps(r))';
  const exec = await runWf({
    nodes:[
      {id:'n1',type:'input',data:{config:{input:'parallel test'}}},
      {id:'na',type:'code',data:{label:'A',config:{language:'python',code:cA}}},
      {id:'nb',type:'code',data:{label:'B',config:{language:'python',code:cB}}},
      {id:'n3',type:'output',data:{label:'R'}},
    ],
    edges:[{id:'e1',source:'n1',target:'na'},{id:'e2',source:'n1',target:'nb'},{id:'e3',source:'na',target:'n3'},{id:'e4',source:'nb',target:'n3'}],
  });
  assert.strictEqual(parse(findOut(exec,'na')).br, 'A');
  assert.strictEqual(parse(findOut(exec,'na')).text, 'parallel test');
  assert.strictEqual(parse(findOut(exec,'nb')).br, 'B');
  assert.strictEqual(parse(findOut(exec,'nb')).len, 13);
});

console.log('\n📦 10. 连续执行稳定性');
await ta('连续5个workflow', async () => {
  for(let i=0;i<5;i++){
    const code=`import json\nr={"i":${i},"t":input_data.get("input","")}\nprint(json.dumps(r))`;
    const exec = await runWf({
      nodes:[{id:'n1',type:'input',data:{config:{input:`batch-${i}`}}},{id:'n2',type:'code',data:{label:`B${i}`,config:{language:'python',code}}}],
      edges:[{id:'e1',source:'n1',target:'n2'}],
    });
    assert.strictEqual(exec.status,'completed');
    assert.strictEqual(parse(findOut(exec,'n2')).t, `batch-${i}`);
  }
});

console.log('\n📦 11. 复杂Python代码');
await ta('计算+列表推导', async () => {
  const code='import json\nd=input_data\nnums=[int(x) for x in d.get("nums","").split(",") if x.strip().isdigit()]\nr={"sum":sum(nums),"max":max(nums) if nums else 0}\nprint(json.dumps(r))';
  const exec = await runWf({
    nodes:[
      {id:'n1',type:'input',data:{config:{input:'Broly',nums:'1,2,3,4,5'}}},
      {id:'n2',type:'code',data:{label:'Calc',config:{language:'python',code}}},
      {id:'n3',type:'output',data:{label:'R'}},
    ],
    edges:[{id:'e1',source:'n1',target:'n2'},{id:'e2',source:'n2',target:'n3'}],
  });
  const o = parse(findOut(exec,'n2'));
  assert.strictEqual(o.sum, 15);
  assert.strictEqual(o.max, 5);
});

console.log('\n📦 12. 空输入边界');
await ta('input=""→default', async () => {
  const code='import json\nt=input_data.get("input","DEFAULT")\nr={"recv":"DEFAULT" if not t else t}\nprint(json.dumps(r))';
  const exec = await runWf({
    nodes:[{id:'n1',type:'input',data:{config:{input:''}}},{id:'n2',type:'code',data:{label:'C',config:{language:'python',code}}},{id:'n3',type:'output',data:{label:'R'}}],
    edges:[{id:'e1',source:'n1',target:'n2'},{id:'e2',source:'n2',target:'n3'}],
  });
  assert.strictEqual(parse(findOut(exec,'n2')).recv, 'DEFAULT');
});

console.log('\n📦 13. 历史查询');
await ta('execution history', async () => {
  const r = await api('GET', '/api/executions/history/144?limit=5');
  assert.ok(r.body.success);
  assert.ok(Array.isArray(r.body.data));
});

console.log(`\n${'='.repeat(50)}`);
console.log(`  结果: ${passed} 通过, ${failed} 失败, ${passed+failed} 总计`);
console.log(`${'='.repeat(50)}`);
if (failed>0) process.exit(1);
