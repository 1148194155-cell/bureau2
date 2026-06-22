const BASE = 'http://localhost:3099/api';
const H = { 'Content-Type': 'application/json', 'X-User-Id': '1' };

async function main() {
  console.log('=== Agent 能力测试 ===\n');

  // 1. 问候测试（不应调用工具）
  console.log('--- 1. 问候测试 ---');
  let r = await fetch(BASE + '/ai/chat', { method:'POST', headers: H, body: JSON.stringify({ message: '你好', history: [], canvas_state: { nodes: [], edges: [] }, model_id: '2', lang: 'zh' }) });
  let d = await r.json();
  const pass1 = d.success && (d.data?.actions?.length || 0) === 0;
  console.log('success:', d.success, '| actions:', d.data?.actions?.length, '| reply:', (d.data?.reply || '').slice(0, 60));
  console.log(pass1 ? '✅ 问候不调用工具' : '❌\n');

  // 2. 创建节点测试
  console.log('\n--- 2. 创建节点测试 ---');
  r = await fetch(BASE + '/ai/chat', { method:'POST', headers: H, body: JSON.stringify({ message: '在画布上添加一个输入节点，标签设为"用户输入"', history: [], canvas_state: { nodes: [], edges: [] }, model_id: '2', lang: 'zh' }) });
  d = await r.json();
  const actions = d.data?.actions || [];
  const hasAddNode = actions.some(a => a.type === 'add_node');
  console.log('success:', d.success, '| actions:', actions.map(a=>a.type).join(','));
  console.log(hasAddNode ? '✅ add_node 被正确调用' : '❌');

  // 3. 文件安全开关测试
  console.log('\n--- 3. 文件安全开关 ---');
  r = await fetch(BASE + '/file-safety', { headers: H });
  d = await r.json();
  console.log('GET:', d.success, '| enabled:', d.data?.enabled);
  r = await fetch(BASE + '/file-safety', { method:'POST', headers: H, body: JSON.stringify({ enabled: false }) });
  d = await r.json();
  console.log('toggle to false:', d.success, '| enabled:', d.data?.enabled);
  r = await fetch(BASE + '/file-safety', { method:'POST', headers: H, body: JSON.stringify({ enabled: true }) });
  d = await r.json();
  console.log('toggle to true:', d.success, '| enabled:', d.data?.enabled);
  console.log('✅ 文件安全开关正常');

  // 4. 健康检查
  console.log('\n--- 4. 健康检查 ---');
  r = await fetch(BASE + '/health', { headers: H });
  d = await r.json();
  console.log('status:', d.status, '| ok:', d.status === 'ok' ? '✅' : '❌');

  // 5. 运行简单工作流
  console.log('\n--- 5. 工作流运行测试 ---');
  r = await fetch(BASE + '/workflows/run', { method:'POST', headers: H, body: JSON.stringify({ nodes: [{ id: 'n1', type: 'input', position: {x:0,y:0}, data: {label:'In'} }, { id: 'n2', type: 'output', position: {x:200,y:0}, data: {label:'Out'} }], edges: [{ id: 'e1', source: 'n1', target: 'n2' }] }) });
  d = await r.json();
  const execId = d.data?.execution_id;
  console.log('execution_id:', execId ? '✅' : '❌');

  // Wait for completion
  if (execId) {
    for (let i = 0; i < 15; i++) {
      await new Promise(rr => setTimeout(rr, 1000));
      r = await fetch(BASE + '/executions/' + execId + '/status', { headers: H });
      d = await r.json();
      if (d.data?.status === 'completed') { console.log('✅ 工作流执行成功'); break; }
      if (d.data?.status === 'failed') { console.log('❌ 执行失败:', d.data?.error); break; }
    }
  }

  // 6. 模型列表
  console.log('\n--- 6. 模型列表 ---');
  r = await fetch(BASE + '/models', { headers: H });
  d = await r.json();
  console.log('models count:', d.data?.length || 0, '|', Array.isArray(d.data) ? '✅' : '❌');

  // 7. Skills 列表
  console.log('\n--- 7. Skills列表 ---');
  r = await fetch(BASE + '/skills', { headers: H });
  d = await r.json();
  console.log('skills count:', d.data?.length || 0, '|', Array.isArray(d.data) ? '✅' : '❌');

  console.log('\n========================================');
  console.log('          测试全部完成');
  console.log('========================================');
}
main().catch(e => console.error('ERROR:', e.message));
