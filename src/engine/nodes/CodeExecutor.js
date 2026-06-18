/**
 * Code 节点执行器（JS / Python / Docker）。
 * @since 2025-01 阶段2：从 executor.js 拆出的独立策略执行器。
 */
import { spawn } from 'node:child_process';
import vm from 'node:vm';
import path from 'node:path';
import fs from 'fs-extra';
import { runInSandbox, isDockerAvailable } from '../dockerSandbox.js';
import { registerNodeExecutor } from '../registry.js';

class CodeExecutor {
  async execute(node, inputData, ctx) {
    const { onLog, timeout, getVar, setVar } = ctx;
    const codeConfig = node.data?.config || {};
    const language = codeConfig.language || 'javascript';
    const code = codeConfig.code || node.data?.code || '';

    if (!code) throw new Error('Code node: no code provided');

    if (language === 'javascript' || language === 'js') {
      return this.runJavaScript(code, inputData, { onLog, timeout, getVar, setVar });
    }

    if (language === 'python' || language === 'py') {
      return this.runPython(code, inputData, { onLog, timeout });
    }

    const sandbox = codeConfig.sandbox || 'auto';
    const useDocker = sandbox === 'docker' || (sandbox === 'auto' && await isDockerAvailable());

    if (useDocker) {
      return runInSandbox({ code, language, input: inputData, timeout });
    }

    // Fallback: subprocess
    return this.runSubprocess(code, language, inputData, timeout);
  }

  runJavaScript(code, inputData, { timeout, getVar, setVar }) {
    const sandbox = {
      input: inputData,
      console: { log: (...args) => { /* silent in sandbox */ } },
      JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp, Map, Set,
      setTimeout, clearTimeout, Buffer, Promise,
      getVar: getVar || (() => undefined),
      setVar: setVar || (() => {}),
    };
    const context = vm.createContext(sandbox);
    const script = new vm.Script(`(function() { ${code} })()`, { timeout });
    return script.runInContext(context, { timeout });
  }

  async runPython(code, inputData, { timeout }) {
    const inputJson = JSON.stringify(inputData ?? {});
    const escapedCode = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
    const pyCode = `import json, sys; ${escapedCode}`;
    const pythonCmd = await resolvePythonCommand();
    return new Promise((resolve, reject) => {
      const proc = spawn(pythonCmd, ['-c', pyCode], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => { proc.kill(); reject(new Error('Python execution timed out')); }, timeout);
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error(stderr || `Python exited with code ${code}`));
        else resolve(safeParseJson(stdout.trim()));
      });
      proc.stdin.write(inputJson);
      proc.stdin.end();
    });
  }

  async runSubprocess(code, language, inputData, timeout) {
    const inputJson = JSON.stringify(inputData ?? {});
    const tmpFile = path.join(process.cwd(), `.code_tmp_${Date.now()}.${language === 'javascript' ? 'mjs' : 'py'}`);
    await fs.writeFile(tmpFile, code, 'utf8');
    try {
      const cmd = language === 'javascript' ? 'node' : await resolvePythonCommand();
      return new Promise((resolve, reject) => {
        const proc = spawn(cmd, [tmpFile], {
          env: { INPUT: inputJson, PYTHONIOENCODING: 'utf-8', ...process.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const timer = setTimeout(() => { proc.kill(); reject(new Error('Code execution timed out')); }, timeout);
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => stdout += d.toString());
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', code => {
          clearTimeout(timer);
          if (code !== 0) reject(new Error(stderr || `Exited with code ${code}`));
          else resolve(safeParseJson(stdout.trim()));
        });
        proc.stdin.end();
      });
    } finally {
      fs.remove(tmpFile).catch(() => {});
    }
  }
}

function safeParseJson(str) {
  try { return JSON.parse(str); } catch { return { output: str }; }
}

/**
 * Resolve the system's Python command.
 * On Windows, Python is often registered as 'python' instead of 'python3'.
 */
let _pythonCmd = null;
async function resolvePythonCommand() {
  if (_pythonCmd) return _pythonCmd;
  for (const candidate of ['python3', 'python']) {
    try {
      const proc = spawn(candidate, ['--version'], { stdio: 'ignore' });
      await new Promise((resolve, reject) => {
        proc.on('close', code => code === 0 ? resolve() : reject());
        proc.on('error', reject);
      });
      _pythonCmd = candidate;
      return candidate;
    } catch { continue; }
  }
  // Fallback — let spawn fail with a clear error
  _pythonCmd = 'python3';
  return 'python3';
}

registerNodeExecutor('code', new CodeExecutor());
