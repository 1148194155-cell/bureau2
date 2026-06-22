// AI tool-call detection verification — focused test
const BASE = 'http://localhost:3096/api';
const H = { 'Content-Type': 'application/json', 'X-User-Id': '1' };

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

const PROMPTS = [
  { name: 'IA1: 创建输入节点', msg: '在画布上添加一个输入节点，标签为"用户输入"', cs: { nodes: [], edges: [] } },
  { name: 'IB1: 翻译工作流', msg: '帮我搭一个翻译工作流，把用户输入的中文翻译成英文', cs: { nodes: [], edges: [] } },
  { name: 'IC1: 条件节点', msg: '在画布上添加一个条件节点，如果分数大于60就通过', cs: { nodes: [], edges: [] } },
  { name: 'ID1: 重命名节点', msg: '把"输入"节点重命名为"用户输入"', cs: canvasState },
  { name: 'IE1: 列出模型', msg: '列出我目前配置了哪些AI模型', cs: { nodes: [], edges: [] } },
  { name: 'IF1: ETL工作流', msg: '帮我搭一个完整ETL流程：输入 → Python清洗 → JS统计 → AI出报告 → 保存文件', cs: { nodes: [], edges: [] } },
  { name: 'IG1: 你好(不调用工具)', msg: '你好', cs: { nodes: [], edges: [] } },
  { name: 'IG4: 运行工作流', msg: '帮我运行当前画布上的工作流', cs: canvasState },
  { name: 'IG5: 清空画布', msg: '把画布清空', cs: canvasState },
];

let pass = 0, fail = 0, totalCalls = 0;
const results = [];

for (const p of PROMPTS) {
  try {
    const r = await fetch(`${BASE}/ai/chat`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        message: p.msg, history: [], canvas_state: p.cs, model_id: '2', lang: 'zh'
      }),
    });
    const raw = await r.json();
    const data = raw.data || raw;
    const actions = data.actions || [];
    const reply = data.reply || '';
    
    totalCalls += actions.length;
    const actionTypes = actions.map(a => a.type);
    const isValid = raw.success && (actions.length > 0 || reply.length > 0);
    
    if (isValid) { pass++; console.log(`✓ ${p.name}`); }
    else { fail++; console.log(`✗ ${p.name} — success=${raw.success} actions=${actions.length} replyLen=${reply.length}`); }
    
    console.log(`    工具调用: [${actionTypes.join(', ') || '无'}] 回复: "${reply.slice(0, 60)}..."`);
    results.push({ name: p.name, success: raw.success, actions: actionTypes, replyLen: reply.length });
  } catch (e) {
    fail++;
    console.log(`✗ ${p.name} — ${e.message}`);
    results.push({ name: p.name, success: false, error: e.message });
  }
}

console.log(`\n--- 汇总 ---`);
console.log(`${pass}/${pass+fail} 通过, 工具调用 ${totalCalls} 次`);
console.log(`\n工具调用分布:`);
for (const r of results) {
  if (r.actions?.length > 0) {
    console.log(`  ${r.name}: [${r.actions.join(', ')}]`);
  }
}
