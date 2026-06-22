// Quick AI chat smoke test — verify tool calling works
const BASE = 'http://localhost:3096/api';
const H = { 'Content-Type': 'application/json', 'X-User-Id': '1' };

async function main() {
  console.log('=== AI Chat Smoke Test ===\n');

  // Test 1: Warm-up
  console.log('--- Warm-up ---');
  let r = await fetch(`${BASE}/ai/chat`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      message: '你好（测试连接）',
      history: [],
      canvas_state: { nodes: [], edges: [] },
      model_id: '2',
      lang: 'zh'
    }),
  });
  let data = await r.json();
  console.log(`Warm-up: success=${data.success}`);
  if (data.data) {
    console.log(`  回复: "${data.data.reply?.slice(0, 50)}..."`);
    console.log(`  工具调用: ${data.data.actions?.length || 0}`);
  }

  // Test 2: Simple node creation
  console.log('\n--- 测试: 创建输入节点 ---');
  r = await fetch(`${BASE}/ai/chat`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      message: '在画布上添加一个输入节点，标签为"用户输入"',
      history: [],
      canvas_state: { nodes: [], edges: [] },
      model_id: '2',
      lang: 'zh'
    }),
  });
  data = await r.json();
  console.log(`success=${data.success}`);
  if (data.data) {
    console.log(`  回复: "${data.data.reply}"`);
    console.log(`  工具调用: ${JSON.stringify(data.data.actions?.map(a => a.type) || [])}`);
  }

  // Test 3: Translation workflow
  console.log('\n--- 测试: 搭建翻译工作流 ---');
  r = await fetch(`${BASE}/ai/chat`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      message: '帮我搭一个翻译工作流，把用户输入的中文翻译成英文',
      history: [],
      canvas_state: { nodes: [], edges: [] },
      model_id: '2',
      lang: 'zh'
    }),
  });
  data = await r.json();
  console.log(`success=${data.success}`);
  if (data.data) {
    console.log(`  回复: "${data.data.reply}"`);
    console.log(`  工具调用: ${JSON.stringify(data.data.actions?.map(a => a.type) || [])}`);
  }

  // Test 4: Complex workflow
  console.log('\n--- 测试: ETL 工作流 ---');
  r = await fetch(`${BASE}/ai/chat`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      message: '帮我搭一个完整ETL流程：输入 → Python清洗 → JS统计 → AI出报告 → 保存文件 → 输出',
      history: [],
      canvas_state: { nodes: [], edges: [] },
      model_id: '2',
      lang: 'zh'
    }),
  });
  data = await r.json();
  console.log(`success=${data.success}`);
  if (data.data) {
    console.log(`  回复: "${data.data.reply}"`);
    console.log(`  工具调用: ${JSON.stringify(data.data.actions?.map(a => a.type) || [])}`);
  }

  // Test 5: Canvas manipulation with existing nodes
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

  console.log('\n--- 测试: 重命名节点 ---');
  r = await fetch(`${BASE}/ai/chat`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      message: '把"输入"节点重命名为"用户输入"',
      history: [],
      canvas_state: canvasState,
      model_id: '2',
      lang: 'zh'
    }),
  });
  data = await r.json();
  console.log(`success=${data.success}`);
  if (data.data) {
    console.log(`  回复: "${data.data.reply}"`);
    console.log(`  工具调用: ${JSON.stringify(data.data.actions?.map(a => a.type) || [])}`);
  }

  // Test 6: Edge case
  console.log('\n--- 测试: 简单问候(不应调用工具) ---');
  r = await fetch(`${BASE}/ai/chat`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      message: '你好',
      history: [],
      canvas_state: { nodes: [], edges: [] },
      model_id: '2',
      lang: 'zh'
    }),
  });
  data = await r.json();
  console.log(`success=${data.success}`);
  if (data.data) {
    console.log(`  回复: "${data.data.reply}"`);
    console.log(`  工具调用: ${JSON.stringify(data.data.actions?.map(a => a.type) || [])}`);
  }
}

main().catch(console.error);
