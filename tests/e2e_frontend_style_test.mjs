import { executeWorkflow } from '../src/engine/executor.js';

const onLog = (level, msg) => console.log(`  ${msg}`);

// 前端 placeholder 模板：用户不写 json.loads(sys.stdin.read())，直接用 input_data
const code = [
  '# input_data 是上游数据字典',
  'import json',
  'def process():',
  '    text = input_data.get("input", "")',
  '    return text.upper()',
  'out = process()',
  'print(json.dumps({"output": out}))',
].join('\n');

const workflow = {
  nodes: [
    { id: 'n1', type: 'input', data: { label: 'Prompt', config: { input: 'hello world from frontend' } } },
    { id: 'n2', type: 'code', data: { label: 'Uppercase', config: { language: 'python', code } } },
    { id: 'n3', type: 'output', data: { label: 'Result' } }
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' }
  ]
};

const result = await executeWorkflow({ workflow, skills: {}, adapters: {}, onLog });
console.log('\nSuccess:', result.success);
const codeOutput = result.outputFiles.find(f => f.nodeId === 'n2');
console.log('Code node output:', codeOutput?.content);
if (!result.success || !codeOutput?.content?.includes('HELLO WORLD FROM FRONTEND')) {
  console.log('❌ 前端输入风格测试失败');
  process.exit(1);
}
console.log('✅ 前端输入风格测试通过');
