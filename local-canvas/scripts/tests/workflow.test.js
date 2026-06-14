const BASE = 'http://localhost:3001/api';

async function test(name, fn) {
  try { await fn(); console.log(`  PASS  ${name}`); }
  catch (e) { console.log(`  FAIL  ${name}: ${e.message}`); process.exitCode = 1; }
}

async function main() {
  // 1. health
  await test('health check', async () => {
    const r = await fetch(`${BASE}/health`);
    const j = await r.json();
    if (j.status !== 'ok') throw new Error('health failed');
  });

  // 2. create + execute + query result
  let execId;
  await test('run simple workflow', async () => {
    const r = await fetch(`${BASE}/workflows/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': '1' },
      body: JSON.stringify({
        nodes: [
          { id: 'n1', type: 'input', position: { x: 0, y: 0 }, data: { label: 'Input', input: { text: 'hello world' } } },
          { id: 'n2', type: 'output', position: { x: 200, y: 0 }, data: { label: 'Output' } },
        ],
        edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      }),
    });
    const j = await r.json();
    if (!j.success) throw new Error(j.error);
    execId = j.data.execution_id;
  });

  // 3. wait for completion
  await test('execution completes', async () => {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const r = await fetch(`${BASE}/executions/${execId}/status`);
      const j = await r.json();
      if (j.data.status === 'completed') return;
      if (j.data.status === 'failed') throw new Error(j.data.error);
    }
    throw new Error('timed out');
  });
}

main();
