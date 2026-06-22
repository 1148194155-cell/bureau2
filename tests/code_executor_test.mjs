/**
 * CodeExecutor 全面测试
 * 覆盖：stdin 双重读取修复、前端 placeholder 模板、多节点数据传递、runSubprocess 路径、边界场景
 */
import { strict as assert } from 'node:assert';

import { buildNodeInput } from '../src/engine/executor.js';
import { getNodeExecutor } from '../src/engine/registry.js';
import '../src/engine/nodes/InputOutputExecutor.js';
import '../src/engine/nodes/CodeExecutor.js';

const executor = getNodeExecutor('code');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
  }
}

const ctx = { onLog: () => {}, timeout: 5000, getVar: () => undefined, setVar: () => {} };

async function runAll() {
  console.log('\n📦 CodeExecutor 全面测试\n');

  // ══════════════════════════════════════════
  // 1. runPython：用户代码自行读取 stdin（核心修复验证）
  // ══════════════════════════════════════════
  await testAsync('含 json.loads(sys.stdin.read()) 不重复注入 preamble', async () => {
    const code = [
      'import json, sys',
      'data = json.loads(sys.stdin.read())',
      'result = {"prompt": data.get("input", ""), "status": "ok"}',
      'print(json.dumps(result))',
    ].join('\n');
    const result = await executor.runPython(code, { input: 'Broly SS4, green hair' }, ctx);
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.prompt, 'Broly SS4, green hair');
  });

  await testAsync('含 json.loads(sys.stdin.read()) 空输入', async () => {
    const code = [
      'import json, sys',
      'data = json.loads(sys.stdin.read())',
      'result = {"count": len(data), "keys": list(data.keys())}',
      'print(json.dumps(result))',
    ].join('\n');
    const result = await executor.runPython(code, {}, ctx);
    assert.strictEqual(result.count, 0);
    assert.deepStrictEqual(result.keys, []);
  });

  await testAsync('含 json.loads(sys.stdin.read()) 复杂嵌套数据', async () => {
    const code = [
      'import json, sys',
      'data = json.loads(sys.stdin.read())',
      'result = {"a": data.get("nested", {}).get("key"), "b": data.get("list", [])[0] if data.get("list") else None}',
      'print(json.dumps(result))',
    ].join('\n');
    const result = await executor.runPython(code, { nested: { key: 'deep' }, list: [1, 2, 3] }, ctx);
    assert.strictEqual(result.a, 'deep');
    assert.strictEqual(result.b, 1);
  });

  await testAsync('预置工作流风格代码（setup_workflows.mjs）', async () => {
    const code = [
      'import json, sys, subprocess, os',
      'data = json.loads(sys.stdin.read())',
      'prompt = data.get("prompt") or data.get("input") or "default"',
      'result = {"prompt": prompt, "random": 42}',
      'print(json.dumps(result))',
    ].join('\n');
    const result = await executor.runPython(code, { input: 'hello' }, ctx);
    assert.strictEqual(result.prompt, 'hello');
    assert.strictEqual(result.random, 42);
  });

  // ━━━ 2. runPython：无 stdin 读取（引擎自动注入 input_data）━━━━
  await testAsync('无 stdin 读取 引擎自动注入 input_data', async () => {
    const code = [
      'import json',
      'result = {"uppercase": input_data.get("text", "").upper()}',
      'print(json.dumps(result))',
    ].join('\n');
    const result = await executor.runPython(code, { text: 'hello world' }, ctx);
    assert.strictEqual(result.uppercase, 'HELLO WORLD');
  });

  await testAsync('前端 placeholder 模板样式', async () => {
    const code = [
      '# input_data 是上游数据字典',
      'import json',
      'def process():',
      '    result = input_data.get("text", "")',
      '    return result',
      'out = process()',
      'print(json.dumps({"output": out}))',
    ].join('\n');
    const result = await executor.runPython(code, { text: 'hello' }, ctx);
    assert.strictEqual(result.output, 'hello');
  });

  await testAsync('无 stdin 读取 + 空输入', async () => {
    const code = [
      'import json',
      'result = {"hasText": "text" in input_data}',
      'print(json.dumps(result))',
    ].join('\n');
    const result = await executor.runPython(code, {}, ctx);
    assert.strictEqual(result.hasText, false);
  });

  await testAsync('无 stdin 读取 + 用 data 变量名（未冲突）', async () => {
    // 用户代码用 data 变量但没读 stdin → preamble 仍注入 input_data，data 是独立变量
    const code = [
      'import json',
      'data = {"local": True, "received": input_data.get("key", None)}',
      'print(json.dumps(data))',
    ].join('\n');
    const result = await executor.runPython(code, { key: 'val' }, ctx);
    assert.strictEqual(result.local, true);
    assert.strictEqual(result.received, 'val');
  });

  // ━━━ 3. runJavaScript（回归 + IIFE 修复）━━━━
  test('JS 对象字面量表达式', () => {
    const result = executor.runJavaScript(
      '({ result: input.text.toUpperCase() })',
      { text: 'hello' },
      { timeout: 5000, getVar: () => {}, setVar: () => {} }
    );
    assert.strictEqual(result.result, 'HELLO');
  });

  test('JS 空输入', () => {
    const result = executor.runJavaScript(
      '({ hasText: input.text !== undefined })',
      {},
      { timeout: 5000, getVar: () => {}, setVar: () => {} }
    );
    assert.strictEqual(result.hasText, false);
  });

  test('JS 多语句表达式（默认 placeholder 风格）', () => {
    const result = executor.runJavaScript(
      'const result = input.text.toUpperCase();\nresult;',
      { text: 'hello' },
      { timeout: 5000, getVar: () => {}, setVar: () => {} }
    );
    assert.strictEqual(result, 'HELLO');
  });

  // ━━━ 4. buildNodeInput 数据传递 ━━━
  test('input → code 节点数据展平', () => {
    const nodes = [
      { id: 'n1', type: 'input', data: { label: 'Prompt' } },
      { id: 'n2', type: 'code' },
    ];
    const edges = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const outputs = { n1: { input: 'test prompt' } };
    const input = buildNodeInput(nodes[1], edges, outputs);
    assert.strictEqual(input.input, 'test prompt');
  });

  test('code → output 节点数据传递', () => {
    const nodes = [
      { id: 'n1', type: 'code' },
      { id: 'n2', type: 'output' },
    ];
    const edges = [{ id: 'e1', source: 'n1', target: 'n2' }];
    const outputs = { n1: { filePath: '/out/img.png', size: 1024, prompt: 'test' } };
    const input = buildNodeInput(nodes[1], edges, outputs);
    assert.strictEqual(input.filePath, '/out/img.png');
    assert.strictEqual(input.size, 1024);
    assert.strictEqual(input.prompt, 'test');
  });

  test('无入边节点使用自身 config', () => {
    const nodes = [{ id: 'n1', type: 'input', data: { config: { input: 'hello' } } }];
    const edges = [];
    const input = buildNodeInput(nodes[0], edges, {});
    assert.strictEqual(input.input, 'hello');
  });

  test('有 mapping 的边按映射传递', () => {
    const nodes = [{ id: 'n1', type: 'code' }, { id: 'n2', type: 'model' }];
    const edges = [{ id: 'e1', source: 'n1', target: 'n2', data: { mapping: { prompt: 'output.text' } } }];
    const outputs = { n1: { output: { text: 'mapped value' } } };
    const input = buildNodeInput(nodes[1], edges, outputs);
    assert.strictEqual(input.prompt, 'mapped value');
  });

  // ━━━ 5. InputOutputExecutor ━━━
  await testAsync('input 节点 — node.data.input 优先', async () => {
    const iexec = getNodeExecutor('input');
    const result = await iexec.execute(
      { type: 'input', data: { input: 'direct', config: { input: 'from_config' } } },
      { input: 'from_inputData' }, ctx
    );
    assert.strictEqual(result, 'direct');
  });

  await testAsync('input 节点 — 回退到 inputData', async () => {
    const iexec = getNodeExecutor('input');
    const result = await iexec.execute(
      { type: 'input', data: { config: { input: 'from_config' } } },
      { input: 'from_inputData' }, ctx
    );
    // node.data?.input is undefined, falls to inputData
    assert.strictEqual(result.input, 'from_inputData');
  });

  await testAsync('input 节点 — buildNodeInput 供给的 config 正确传递', async () => {
    // 模拟真实工作流：buildNodeInput 为 input 节点返回 config
    const iexec = getNodeExecutor('input');
    const node = { type: 'input', data: { label: 'Prompt', config: { input: 'hello world' } } };
    // buildNodeInput 会返回 node.data.config = { input: 'hello world' }
    const inputData = buildNodeInput(node, [], {});
    assert.strictEqual(inputData.input, 'hello world');
    // 然后 execute 收到 inputData
    const result = await iexec.execute(node, inputData, ctx);
    assert.strictEqual(result.input, 'hello world');
  });

  await testAsync('output 节点透传', async () => {
    const oexec = getNodeExecutor('output');
    const result = await oexec.execute({ type: 'output' }, { a: 1, b: 2 }, ctx);
    assert.strictEqual(result.a, 1);
    assert.strictEqual(result.b, 2);
  });

  // ━━━ 6. runSubprocess（通过环境变量传参）━━━━
  await testAsync('runSubprocess Python 通过 INPUT 环境变量获取数据', async () => {
    const code = [
      'import json, os',
      'data = json.loads(os.environ.get("INPUT", "{}"))',
      'result = {"x": data.get("x", 0) * 2}',
      'print(json.dumps(result))',
    ].join('\n');
    const result = await executor.runSubprocess(code, 'python', { x: 21 }, 5000);
    assert.strictEqual(result.x, 42);
  });

  await testAsync('runSubprocess JavaScript 通过 INPUT 环境变量获取数据', async () => {
    const code = `const input = JSON.parse(process.env.INPUT || '{}'); console.log(JSON.stringify({ doubled: input.x * 2 }));`;
    const result = await executor.runSubprocess(code, 'javascript', { x: 10 }, 5000);
    assert.strictEqual(result.doubled, 20);
  });

  // ━━━ 7. 错误场景 ━━━
  await testAsync('Python 语法错误', async () => {
    try {
      await executor.runPython('iff True:\n  pass', {}, ctx);
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('Python exited') || err.message.includes('SyntaxError'),
        `got: ${err.message}`);
    }
  });

  await testAsync('Python 除零错误', async () => {
    const code = [
      'import json, sys',
      'data = json.loads(sys.stdin.read())',
      'result = 1 / 0',
      'print(json.dumps({"ok": True}))',
    ].join('\n');
    try {
      await executor.runPython(code, {}, ctx);
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(
        err.message.includes('division by zero') || err.message.includes('Python exited'),
        `got: ${err.message}`
      );
    }
  });

  await testAsync('Python 执行超时', async () => {
    const code = [
      'import json, sys, time',
      'data = json.loads(sys.stdin.read())',
      'time.sleep(30)',
      'print(json.dumps({"ok": True}))',
    ].join('\n');
    try {
      await executor.runPython(code, {}, { ...ctx, timeout: 1000 });
      assert.fail('should have timed out');
    } catch (err) {
      assert.ok(err.message.includes('timed out'), `got: ${err.message}`);
    }
  });

  // ━━━ 8. 边界：误匹配场景（已知限制）━━━━
  await testAsync('注释/字符串中含 stdin 模式 → regex 误判，input_data 不注入（已知限制）', async () => {
    // 因为 regex /json\.loads\(sys\.stdin\.read\(\)\)/ 是简单的文本匹配，
    // 无法区分注释/字符串中出现的相同文本。这会导致 preamble 不注入，
    // 代码中引用 input_data 会 NameError。
    // 实际产品中此场景极罕见（注释中不会写完整的 json.loads 调用）
    const code = [
      '# 注释: json.loads(sys.stdin.read()) 这只是注释',
      'import json',
      'result = {"note": "this pattern causes false positive"}',
      'print(json.dumps(result))',
    ].join('\n');
    // 不引用 input_data → 不应报错
    const result = await executor.runPython(code, { a: 1 }, ctx);
    assert.strictEqual(result.note, 'this pattern causes false positive');
  });

  await testAsync('误匹配 + 引用 input_data → 会报 NameError（预期行为）', async () => {
    const code = [
      '# json.loads(sys.stdin.read()) in comment',
      'import json',
      'result = {"keys": list(input_data.keys())}',
      'print(json.dumps(result))',
    ].join('\n');
    try {
      await executor.runPython(code, { a: 1 }, ctx);
      assert.fail('should have thrown NameError');
    } catch (err) {
      assert.ok(err.message.includes('input_data') || err.message.includes('Python exited'),
        `expected NameError about input_data, got: ${err.message}`);
    }
  });

  // ━━━ 9. 完整工作流模拟 ━━━
  await testAsync('完整工作流: input → code(python) → output', async () => {
    const iexec = getNodeExecutor('input');
    const oexec = getNodeExecutor('output');

    // Step 1: input 节点 → 输出 { input: 'hello world' }
    const inputNode = { type: 'input', data: { label: 'Prompt', config: { input: 'hello world' } } };
    const inputNodeInput = buildNodeInput(inputNode, [], {});
    const output1 = await iexec.execute(inputNode, inputNodeInput, ctx);

    // Step 2: code 节点 → 转大写
    const codeNode = { id: 'n2', type: 'code' };
    const codeInput = buildNodeInput(codeNode, [{ id: 'e1', source: 'n1', target: 'n2' }], { n1: output1 });
    // codeInput 现在应为 { n1: { input: 'hello world' }, input: 'hello world' }
    const code = [
      'import json',
      'result = {"text": input_data.get("input", "").upper()}',
      'print(json.dumps(result))',
    ].join('\n');
    const output2 = await executor.runPython(code, codeInput, ctx);

    // Step 3: output 节点
    const outputNode = { type: 'output' };
    const finalResult = await oexec.execute(outputNode, output2, ctx);
    assert.strictEqual(finalResult.text, 'HELLO WORLD');
  });

  // ── 总结 ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`结果: ${passed} 通过, ${failed} 失败, ${passed + failed} 总计`);
  if (failed > 0) process.exit(1);
}

runAll().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
