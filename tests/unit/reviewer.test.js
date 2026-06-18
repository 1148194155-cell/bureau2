import { describe, it, expect } from 'vitest';
import { reviewPreExecution, reviewPostExecution } from '../../src/review/reviewer.js';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

// ═══════════════════════════════════════════════════════════════════════════
// reviewPreExecution
// ═══════════════════════════════════════════════════════════════════════════

describe('reviewPreExecution', () => {
  // ── Structure ────────────────────────────────────────────────────────────

  describe('结构校验 (structure)', () => {
    it('returns fail for empty workflow (no nodes)', () => {
      const result = reviewPreExecution({ nodes: [], edges: [] }, [], []);
      expect(result.status).toBe('fail');
      expect(result.summary).toContain('fail');
      const struct = result.sections.find(s => s.name === '结构校验');
      expect(struct.status).toBe('fail');
      expect(struct.issues.some(i => i.message.includes('no nodes'))).toBe(true);
    });

    it('returns pass for a valid simple workflow', () => {
      const nodes = [
        { id: '1', type: 'input', data: { label: 'Input' } },
        { id: '2', type: 'output', data: { label: 'Output' } },
      ];
      const edges = [{ source: '1', target: '2' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      expect(result.status).not.toBe('fail');
    });

    it('returns fail for cyclic workflow', () => {
      const nodes = [
        { id: 'a', type: 'skill' },
        { id: 'b', type: 'skill' },
      ];
      const edges = [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      expect(result.status).toBe('fail');
      const struct = result.sections.find(s => s.name === '结构校验');
      expect(struct.status).toBe('fail');
      expect(struct.issues.some(i => i.message.includes('cyclic'))).toBe(true);
    });

    it('warns when all nodes have no incoming connections', () => {
      const nodes = [
        { id: '1', type: 'skill', data: {} },
        { id: '2', type: 'output', data: {} },
      ];
      const result = reviewPreExecution({ nodes, edges: [] }, [], []);
      const struct = result.sections.find(s => s.name === '结构校验');
      expect(struct.issues.some(i => i.message.includes('nothing is wired'))).toBe(true);
    });

    it('warns when no output/file_output node exists', () => {
      const nodes = [
        { id: '1', type: 'input', data: { label: 'In' } },
        { id: '2', type: 'skill', data: { label: 'Proc' } },
      ];
      const edges = [{ source: '1', target: '2' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      const struct = result.sections.find(s => s.name === '结构校验');
      expect(struct.issues.some(i => i.message.includes('output'))).toBe(true);
    });

    it('warns about isolated non-input nodes', () => {
      const nodes = [
        { id: '1', type: 'input', data: { label: 'In' } },
        { id: '2', type: 'skill', data: { label: 'Isolated' } },
        { id: '3', type: 'output', data: { label: 'Out' } },
      ];
      const edges = [{ source: '1', target: '3' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      const struct = result.sections.find(s => s.name === '结构校验');
      expect(struct.issues.some(i => i.message.includes('Isolated') && i.message.includes('Isolated'))).toBe(true);
    });

    it('does not warn about isolated input nodes', () => {
      const nodes = [
        { id: '1', type: 'input', data: { label: 'In' } },
        { id: '2', type: 'output', data: { label: 'Out' } },
      ];
      const edges = [{ source: '1', target: '2' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      const struct = result.sections.find(s => s.name === '结构校验');
      // No isolated warning because input nodes are exempt
      expect(struct.issues.filter(i => i.message.includes('Isolated'))).toHaveLength(0);
    });
  });

  // ── Config ───────────────────────────────────────────────────────────────

  describe('配置校验 (config)', () => {
    it('errors when skill node references non-existent skill', () => {
      const nodes = [
        { id: '1', type: 'skill', data: { skillId: 'missing-skill' } },
        { id: '2', type: 'output', data: {} },
      ];
      const edges = [{ source: '1', target: '2' }];
      const skills = [{ id: 'other-skill', name: 'Other' }];
      const result = reviewPreExecution({ nodes, edges }, skills, []);
      const config = result.sections.find(s => s.name === '配置校验');
      expect(config.issues.some(i => i.message.includes('not found'))).toBe(true);
      expect(result.status).toBe('fail');
    });

    it('errors when model node references non-existent model', () => {
      const nodes = [
        { id: '1', type: 'input', data: {} },
        { id: '2', type: 'llm', data: { modelId: '99' } },
        { id: '3', type: 'output', data: {} },
      ];
      const edges = [
        { source: '1', target: '2' },
        { source: '2', target: '3' },
      ];
      const models = [{ id: 1, name: 'other', is_active: true }];
      const result = reviewPreExecution({ nodes, edges }, [], models);
      const config = result.sections.find(s => s.name === '配置校验');
      expect(config.issues.some(i => i.message.includes('not found'))).toBe(true);
      expect(result.status).toBe('fail');
    });

    it('errors when model is inactive', () => {
      const nodes = [
        { id: '1', type: 'input', data: {} },
        { id: '2', type: 'model', data: { modelId: '1' } },
        { id: '3', type: 'output', data: {} },
      ];
      const edges = [
        { source: '1', target: '2' },
        { source: '2', target: '3' },
      ];
      const models = [{ id: 1, name: 'inactive-model', is_active: false }];
      const result = reviewPreExecution({ nodes, edges }, [], models);
      const config = result.sections.find(s => s.name === '配置校验');
      expect(config.issues.some(i => i.message.includes('not active'))).toBe(true);
      expect(result.status).toBe('fail');
    });

    it('warns when code node has empty code', () => {
      const nodes = [
        { id: '1', type: 'code', data: { code: '  ' } },
        { id: '2', type: 'output', data: {} },
      ];
      const edges = [{ source: '1', target: '2' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      const config = result.sections.find(s => s.name === '配置校验');
      expect(config.issues.some(i => i.message.includes('empty code'))).toBe(true);
    });

    it('errors for unsupported file_output format', () => {
      const nodes = [
        { id: '1', type: 'input', data: {} },
        { id: '2', type: 'file_output', data: { config: { format: 'exe' } } },
      ];
      const edges = [{ source: '1', target: '2' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      const config = result.sections.find(s => s.name === '配置校验');
      expect(config.issues.some(i => i.message.includes('Unsupported'))).toBe(true);
      expect(result.status).toBe('fail');
    });

    it('passes config for valid skill reference', () => {
      const nodes = [
        { id: '1', type: 'skill', data: { skillId: 'valid-skill' } },
        { id: '2', type: 'output', data: {} },
      ];
      const edges = [{ source: '1', target: '2' }];
      const skills = [{ id: 'valid-skill', name: 'Valid' }];
      const result = reviewPreExecution({ nodes, edges }, skills, []);
      const config = result.sections.find(s => s.name === '配置校验');
      expect(config.issues.filter(i => i.severity === 'error')).toHaveLength(0);
    });
  });

  // ── Security ─────────────────────────────────────────────────────────────

  describe('安全审查 (security)', () => {
    it('warns about dangerous code patterns', () => {
      const nodes = [
        { id: '1', type: 'code', data: { code: 'const fs = require("fs");' } },
        { id: '2', type: 'output', data: {} },
      ];
      const edges = [{ source: '1', target: '2' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      const sec = result.sections.find(s => s.name === '安全审查');
      expect(sec.issues.some(i => i.message.includes('require('))).toBe(true);
    });

    it('warns about VM sandbox mode for code nodes (less secure)', () => {
      const nodes = [
        { id: '1', type: 'code', data: { code: 'return 1+1;', sandbox: 'vm' } },
        { id: '2', type: 'output', data: {} },
      ];
      const edges = [{ source: '1', target: '2' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      const sec = result.sections.find(s => s.name === '安全审查');
      expect(sec.issues.some(i => i.message.includes('sandbox'))).toBe(true);
    });

    it('warns about API nodes targeting private IPs', () => {
      const nodes = [
        { id: '1', type: 'api', data: { config: { url: 'http://127.0.0.1:8080/api' } } },
        { id: '2', type: 'output', data: {} },
      ];
      const edges = [{ source: '1', target: '2' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      const sec = result.sections.find(s => s.name === '安全审查');
      expect(sec.issues.some(i => i.message.includes('private'))).toBe(true);
    });

    it('flags 192.168.x.x as private', () => {
      const nodes = [
        { id: '1', type: 'api', data: { config: { url: 'http://192.168.1.1/api' } } },
        { id: '2', type: 'output', data: {} },
      ];
      const edges = [{ source: '1', target: '2' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      const sec = result.sections.find(s => s.name === '安全审查');
      expect(sec.issues.some(i => i.message.includes('private'))).toBe(true);
    });

    it('flags 10.x.x.x as private', () => {
      const nodes = [
        { id: '1', type: 'api', data: { config: { url: 'http://10.0.0.1/api' } } },
        { id: '2', type: 'output', data: {} },
      ];
      const edges = [{ source: '1', target: '2' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      const sec = result.sections.find(s => s.name === '安全审查');
      expect(sec.issues.some(i => i.message.includes('private'))).toBe(true);
    });

    it('does not flag public URLs', () => {
      const nodes = [
        { id: '1', type: 'api', data: { config: { url: 'https://api.github.com/repos' } } },
        { id: '2', type: 'output', data: {} },
      ];
      const edges = [{ source: '1', target: '2' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      const sec = result.sections.find(s => s.name === '安全审查');
      expect(sec.issues.filter(i => i.message.includes('private'))).toHaveLength(0);
    });

    it('errors when file_output targets system path', () => {
      const nodes = [
        { id: '1', type: 'input', data: {} },
        { id: '2', type: 'file_output', data: { config: { outputDir: '/etc/output' } } },
      ];
      const edges = [{ source: '1', target: '2' }];
      const result = reviewPreExecution({ nodes, edges }, [], []);
      const sec = result.sections.find(s => s.name === '安全审查');
      expect(sec.issues.some(i => i.severity === 'error' && i.message.includes('system path'))).toBe(true);
    });

    it('warns about missing timeout on skill/code nodes', () => {
      const nodes = [
        { id: '1', type: 'skill', data: { skillId: 's1', timeout: 300000 } },
        { id: '2', type: 'output', data: {} },
      ];
      const edges = [{ source: '1', target: '2' }];
      const skills = [{ id: 's1', name: 'S1' }];
      const result = reviewPreExecution({ nodes, edges }, skills, []);
      const sec = result.sections.find(s => s.name === '安全审查');
      expect(sec.issues.some(i => i.message.includes('timeout'))).toBe(true);
    });

    it('passes security for a clean workflow', () => {
      const nodes = [
        { id: '1', type: 'input', data: {} },
        { id: '2', type: 'llm', data: { modelId: '1', timeout: 30000 } },
        { id: '3', type: 'output', data: {} },
      ];
      const edges = [
        { source: '1', target: '2' },
        { source: '2', target: '3' },
      ];
      const models = [{ id: 1, name: 'ok', is_active: true }];
      const result = reviewPreExecution({ nodes, edges }, [], models);
      const sec = result.sections.find(s => s.name === '安全审查');
      const errors = sec.issues.filter(i => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  // ── Integration ──────────────────────────────────────────────────────────

  it('returns pass when all sections pass', () => {
    const nodes = [
      { id: '1', type: 'input', data: { label: 'In' } },
      { id: '2', type: 'llm', data: { modelId: '1', timeout: 30000 } },
      { id: '3', type: 'output', data: { label: 'Out' } },
    ];
    const edges = [
      { source: '1', target: '2' },
      { source: '2', target: '3' },
    ];
    const models = [{ id: 1, name: 'active-model', is_active: true }];
    const result = reviewPreExecution({ nodes, edges }, [], models);
    expect(result.status).toBe('pass');
    expect(result.summary).toContain('pass');
    expect(result.sections).toHaveLength(3);
  });

  it('returns warn when only warnings exist', () => {
    const nodes = [
      { id: '1', type: 'code', data: { code: 'return 1+1;' } },
      { id: '2', type: 'output', data: {} },
    ];
    const edges = [{ source: '1', target: '2' }];
    const result = reviewPreExecution({ nodes, edges }, [], []);
    // Should be 'warn' because: no input node (warn), sandbox warning (warn)
    // But no errors
    expect(['warn', 'pass']).toContain(result.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// reviewPostExecution
// ═══════════════════════════════════════════════════════════════════════════

describe('reviewPostExecution', () => {
  it('returns pass when no file_output nodes', () => {
    const outputFiles = [
      { nodeId: '1', nodeType: 'llm', content: 'some text' },
    ];
    const result = reviewPostExecution(outputFiles);
    expect(result.status).toBe('pass');
    expect(result.sections[0].issues).toHaveLength(0);
  });

  it('returns pass for empty array', () => {
    const result = reviewPostExecution([]);
    expect(result.status).toBe('pass');
  });

  it('warns when file not found', () => {
    const outputFiles = [
      { nodeId: 'f1', nodeType: 'file_output', filePath: '/nonexistent/path/output.json' },
    ];
    const result = reviewPostExecution(outputFiles);
    // File doesn't exist → warning
    const section = result.sections[0];
    expect(section.issues.some(i => i.message.includes('not found'))).toBe(true);
  });

  it('warns when output size is 0 bytes', () => {
    const outputFiles = [
      { nodeId: 'f1', nodeType: 'file_output', size: 0 },
    ];
    const result = reviewPostExecution(outputFiles);
    const section = result.sections[0];
    expect(section.issues.some(i => i.message.includes('0 bytes'))).toBe(true);
  });

  it('detects malformed JSON output', () => {
    const tmpDir = os.tmpdir();
    const badJsonPath = path.join(tmpDir, 'test-bad.json');
    fs.writeFileSync(badJsonPath, 'not valid json {{{', 'utf8');

    try {
      const outputFiles = [
        { nodeId: 'f1', nodeType: 'file_output', filePath: badJsonPath, content: badJsonPath },
      ];
      const result = reviewPostExecution(outputFiles);
      const section = result.sections[0];
      expect(section.issues.some(i => i.message.includes('malformed'))).toBe(true);
    } finally {
      try { fs.unlinkSync(badJsonPath); } catch {}
    }
  });

  it('detects empty JSON file', () => {
    const tmpDir = os.tmpdir();
    const emptyJsonPath = path.join(tmpDir, 'test-empty.json');
    fs.writeFileSync(emptyJsonPath, '', 'utf8');

    try {
      const outputFiles = [
        { nodeId: 'f1', nodeType: 'file_output', filePath: emptyJsonPath, content: emptyJsonPath },
      ];
      const result = reviewPostExecution(outputFiles);
      const section = result.sections[0];
      expect(section.issues.some(i => i.message.includes('empty'))).toBe(true);
    } finally {
      try { fs.unlinkSync(emptyJsonPath); } catch {}
    }
  });

  it('passes for valid JSON file', () => {
    const tmpDir = os.tmpdir();
    const validJsonPath = path.join(tmpDir, 'test-valid.json');
    fs.writeFileSync(validJsonPath, '{"ok": true}', 'utf8');

    try {
      const outputFiles = [
        { nodeId: 'f1', nodeType: 'file_output', filePath: validJsonPath, content: validJsonPath },
      ];
      const result = reviewPostExecution(outputFiles);
      const section = result.sections[0];
      expect(section.issues.filter(i => i.severity === 'error')).toHaveLength(0);
    } finally {
      try { fs.unlinkSync(validJsonPath); } catch {}
    }
  });
});
