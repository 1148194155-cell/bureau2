/**
 * Skill 节点执行器（子进程技能 + LLM 驱动技能）。
 * @since 2025-01 阶段2：从 executor.js 拆出的独立策略执行器。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import { registerNodeExecutor } from '../registry.js';

class SkillExecutor {
  async execute(node, inputData, ctx) {
    const { skills, adapters, onLog, timeout, retryCount, retryDelay } = ctx;
    const skillId = node.data?.skillId || node.data?.skill_id;
    const skill = skills[skillId];
    if (!skill) throw new Error(`Skill "${skillId}" not found`);

    onLog('info', `Running skill "${skill.name || skillId}"`);

    // Discovered skill: call via LLM
    if (skill.type === 'discovered' || skill.type === 'llm') {
      return this.executeDiscoveredSkill(node, inputData, skill, adapters, onLog, timeout, retryCount, retryDelay);
    }

    // Native skill: spawn subprocess
    const entry = skill.entry || skill.path;
    if (!entry) throw new Error(`Skill "${skillId}" has no entry point`);

    const entryPath = path.resolve(entry);
    const entryType = entry.endsWith('.py') ? 'python' : entry.endsWith('.mjs') || entry.endsWith('.js') ? 'node' : 'shell';
    const inputJson = JSON.stringify(inputData ?? {});
    return spawnSubprocess(entryPath, entryType, inputJson, timeout);
  }

  async executeDiscoveredSkill(node, inputData, skillConfig, adapters, onLog, timeout, retryCount, retryDelay) {
    const mdPath = path.join(skillConfig.path, 'SKILL.md');
    let systemPrompt;
    try {
      systemPrompt = fs.readFileSync(mdPath, 'utf8');
    } catch {
      throw new Error(`Discovered skill "${skillConfig.name}": SKILL.md not found at ${mdPath}`);
    }
    if (!systemPrompt || !systemPrompt.trim()) {
      throw new Error(`Discovered skill "${skillConfig.name}": SKILL.md is empty`);
    }
    onLog('info', `Executing discovered skill "${skillConfig.name}" via LLM (SKILL.md: ${systemPrompt.length} chars)`);

    const userPrompt = typeof inputData === 'string' ? inputData : JSON.stringify(inputData);
    const preferredModel = node.data?.config?.model_id || node.data?.model_id;
    let adapter;
    if (preferredModel && adapters[preferredModel]) {
      adapter = adapters[preferredModel];
    } else {
      adapter = Object.values(adapters).find(a => a && typeof a.chat === 'function' && a.name !== '内置模型 (本地)')
        || Object.values(adapters).find(a => a && typeof a.chat === 'function');
    }
    if (!adapter) {
      throw new Error(`Discovered skill "${skillConfig.name}" requires an AI model but none is available`);
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    const result = await adapter.chat(messages, {
      temperature: node.data?.config?.temperature ?? 0.3,
      max_tokens: node.data?.config?.max_tokens ?? 4096,
      timeout,
    });
    onLog('info', `Discovered skill "${skillConfig.name}" completed`);
    return safeParseJson(result.content);
  }
}

function spawnSubprocess(entryPath, entryType, inputJson, timeout) {
  return new Promise((resolve, reject) => {
    const resolvedEntry = path.resolve(entryPath);
    const cwd = path.dirname(resolvedEntry);
    let cmd, args;
    if (entryType === 'python') {
      if (process.platform === 'win32') {
        const candidates = ['python3', 'python', 'py'];
        cmd = null;
        for (const c of candidates) {
          try {
            require('child_process').execSync(`where ${c} 2>nul`, { stdio: 'ignore', timeout: 3000 });
            cmd = c;
            break;
          } catch {}
        }
        if (!cmd) { reject(new Error(`Python not found (tried: ${candidates.join(', ')})`)); return; }
      } else { cmd = 'python3'; }
      args = [resolvedEntry];
    } else if (entryType === 'node') {
      cmd = 'node'; args = [resolvedEntry];
    } else if (entryType === 'shell') {
      if (process.platform === 'win32') {
        cmd = 'cmd.exe'; args = ['/d', '/c', resolvedEntry.includes(' ') ? `"${resolvedEntry}"` : resolvedEntry];
      } else { cmd = '/bin/sh'; args = [resolvedEntry]; }
    } else { cmd = resolvedEntry; args = []; }

    const safeEnv = {
      INPUT: inputJson, PYTHONIOENCODING: 'utf-8',
      HOME: process.env.HOME || process.env.USERPROFILE || '',
      USER: process.env.USER || process.env.USERNAME || '',
      TMP: process.env.TMP || process.env.TMPDIR || '',
      TEMP: process.env.TEMP || '', PATH: process.env.PATH || '',
      SystemRoot: process.env.SystemRoot || '',
      LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
      LANG: process.env.LANG || 'en_US.UTF-8',
    };
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env: safeEnv, cwd });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Subprocess timed out after ${timeout}ms`)); }, timeout);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    let stdout = '', stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Subprocess exited with code ${code}: ${stderr}`));
      else resolve(stdout.trim());
    });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.stdin.write(inputJson);
    child.stdin.end();
  });
}

function safeParseJson(str) {
  try { return JSON.parse(str); } catch { return { output: str }; }
}

registerNodeExecutor('skill', new SkillExecutor());
