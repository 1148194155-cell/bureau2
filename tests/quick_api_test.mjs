// Quick single-test to verify API connectivity
const r1 = await fetch('http://localhost:3001/api/health');
console.log('Health:', r1.status, await r1.text());

const code = 'import json\nr={"echo":input_data.get("input","")}\nprint(json.dumps(r))';
const r2 = await fetch('http://localhost:3001/api/workflows/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nodes: [
      { id: 'n1', type: 'input', data: { config: { input: 'hello-world' } } },
      { id: 'n2', type: 'code', data: { label: 'Echo', config: { language: 'python', code } } },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    options: { mode: 'auto' },
  }),
});
const j2 = await r2.json();
console.log('Run status:', r2.status, 'Success:', j2.success, 'ExecId:', j2.data?.execution_id, 'Error:', j2.error);

// Poll
const execId = j2.data?.execution_id;
if (execId) {
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const r3 = await fetch(`http://localhost:3001/api/executions/${execId}/status`);
    const j3 = await r3.json();
    console.log(`  [${i}] status=${j3.data?.status}`);
    if (j3.data?.status === 'completed') {
      const out = j3.data.output_files?.find(f => f.nodeId === 'n2');
      console.log('  Output:', out?.content);
      console.log('\n✅ Single test PASSED');
      break;
    }
    if (j3.data?.status === 'failed') {
      console.log('  Error:', j3.data.error);
      console.log('\n❌ Execution failed');
      process.exit(1);
    }
  }
}
