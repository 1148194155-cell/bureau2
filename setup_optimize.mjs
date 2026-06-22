/**
 * 一键优化脚本 — 添加轻量模型 + 优化配置
 * 运行: node setup_optimize.mjs
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

const DB_PATH = path.join(os.homedir(), '.localcanvas', 'localcanvas.db');
const db = new Database(DB_PATH);

console.log('=== Local Canvas 性能优化 ===\n');

// 1. 检查 qwen2.5:3b 是否已在 Ollama 中
async function checkModel() {
  try {
    const r = await fetch('http://localhost:11434/api/tags');
    const data = await r.json();
    const models = (data.models || []).map(m => m.name);
    console.log('Ollama 可用模型:', models.join(', '));
    
    if (models.includes('qwen2.5:3b')) {
      console.log('✅ qwen2.5:3b 已就绪');
      return true;
    }
    console.log('⏳ qwen2.5:3b 未下载，请运行: ollama pull qwen2.5:3b');
    return false;
  } catch {
    console.log('⚠️ 无法连接 Ollama');
    return false;
  }
}

// 2. 添加 qwen2.5:3b 到数据库（如果不存在）
function addModelToDb() {
  const existing = db.prepare("SELECT id FROM models WHERE name = ?").get('qwen2.5:3b');
  if (!existing) {
    db.prepare(
      'INSERT INTO models (user_id, name, adapter_type, config) VALUES (?, ?, ?, ?)'
    ).run(1, 'qwen2.5:3b', 'ollama', JSON.stringify({
      endpoint: 'http://localhost:11434',
      model: 'qwen2.5:3b',
    }));
    console.log('✅ qwen2.5:3b 已添加到模型列表');
  } else {
    console.log('✅ qwen2.5:3b 已在模型列表中');
  }
}

// 3. 清理过多测试记录提高 DB 查询速度
function cleanup() {
  const oldCount = db.prepare('SELECT COUNT(*) as c FROM workflows').get().c;
  // 删除 sched_test 和 test_webhook 等测试用工作流
  const deleted = db.prepare("DELETE FROM workflows WHERE name LIKE '%test%' OR name LIKE 'sched%'").run();
  const newCount = db.prepare('SELECT COUNT(*) as c FROM workflows').get().c;
  console.log(`✅ 清理了 ${deleted.changes} 个测试工作流 (${oldCount} → ${newCount})`);
}

await checkModel();
addModelToDb();

console.log('\n=== 优化完成 ===');
console.log('请重启服务后，在 AI 对话框选择 qwen2.5:3b 模型以获得更快响应速度');
console.log('若 qwen2.5:3b 未下载，运行: ollama pull qwen2.5:3b');
db.close();
