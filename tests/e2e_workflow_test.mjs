import { executeWorkflow } from '../src/engine/executor.js';

const logLines = [];
const onLog = (level, msg) => { logLines.push(`[${level}] ${msg}`); console.log(`  ${msg}`); };

// 模拟预置文生图工作流
const code = [
  'import json, sys',
  'data = json.loads(sys.stdin.read())',
  'prompt = data.get("prompt") or data.get("input") or "default"',
  'result = {"status": "ok", "prompt": prompt, "simulated": True}',
  'print(json.dumps(result))',
].join('\n');

const workflow = {
  nodes: [
    { id: 'n1', type: 'input', data: { label: 'Prompt', config: { input: 'Broly Super Saiyan 4, green hair, muscular, anime style' } } },
    { id: 'n2', type: 'code', data: { label: 'Generate Image', config: { language: 'python', code } } },
    { id: 'n3', type: 'output', data: { label: 'Result' } }
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' }
  ]
};

const result = await executeWorkflow({ workflow, skills: {}, adapters: {}, onLog });
console.log('\nSuccess:', result.success);
console.log('Output files:', JSON.stringify(result.outputFiles, null, 2));
if (!result.success) process.exit(1);
console.log('\n✅ 端到端工作流执行成功');
