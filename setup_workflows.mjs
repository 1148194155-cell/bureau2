import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), '.localcanvas', 'localcanvas.db');
const db = new Database(dbPath);

// Python code for image generation - 避开反斜杠问题，用 split 代替 regex
const pyCode = [
  "import json, sys, subprocess, os",
  "data = json.loads(sys.stdin.read())",
  "prompt = data.get('prompt') or data.get('input') or 'beautiful landscape'",
  "script = os.path.join(os.getcwd(), 'generate_fast.py')",
  "if not os.path.exists(script):",
  "    result = {'error': 'generate_fast.py not found', 'note': '请确认项目根目录有 generate_fast.py'}",
  "else:",
  "    try:",
  "        r = subprocess.run([sys.executable, script, prompt], capture_output=True, text=True, timeout=300, encoding='utf-8', errors='replace')",
  "        out = r.stdout",
  "        marker = '[RESULT]'",
  "        idx = out.find(marker)",
  "        if idx >= 0:",
  "            json_str = out[idx + len(marker):].strip()",
  "            result = json.loads(json_str)",
  "        else:",
  "            result = {'output': out[-300:]}",
  "    except Exception as e:",
  "        result = {'error': str(e)}",
  "print(json.dumps(result))",
].join('\n');

const nodes = [
  { id: 'n1', type: 'input', position: { x: 80, y: 220 }, data: { label: 'Prompt', config: { input: 'Broly Super Saiyan 4, green hair, muscular, anime style, high quality' } } },
  { id: 'n2', type: 'code', position: { x: 380, y: 220 }, data: { label: 'Generate Image', config: { language: 'python', code: pyCode, timeout: 300000 } } },
  { id: 'n3', type: 'file_output', position: { x: 700, y: 220 }, data: { label: 'Save Image', config: { format: 'json', fileName: 'gen_result', outputDir: 'output' } } },
  { id: 'n4', type: 'output', position: { x: 920, y: 220 }, data: { label: 'Result' } }
];
const edges = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n2', target: 'n3' },
  { id: 'e3', source: 'n3', target: 'n4' }
];

// Delete old ones first
db.prepare("DELETE FROM workflows WHERE name LIKE '%SSD-1B%' OR name LIKE '%文生图%' OR name LIKE '%文生视频%'").run();

const r1 = db.prepare('INSERT INTO workflows (user_id, name, nodes, edges) VALUES (?, ?, ?, ?)').run(1, '文生图工作流', JSON.stringify(nodes), JSON.stringify(edges));
console.log('✅ 文生图工作流 ID:', r1.lastInsertRowid);

// Video workflow - simpler code, no backslashes
const vidCode = [
  "import json, sys, subprocess, os",
  "data = json.loads(sys.stdin.read())",
  "prompt = data.get('prompt') or data.get('input') or 'default scene'",
  "script = os.path.join(os.getcwd(), 'generate_video_fast.py')",
  "if not os.path.exists(script):",
  "    result = {'error': 'generate_video_fast.py not found'}",
  "else:",
  "    try:",
  "        r = subprocess.run([sys.executable, script, prompt, '', '40', '8'], capture_output=True, text=True, timeout=600, encoding='utf-8', errors='replace')",
  "        out = r.stdout",
  "        marker = '[RESULT]'",
  "        idx = out.find(marker)",
  "        if idx >= 0:",
  "            json_str = out[idx + len(marker):].strip()",
  "            result = json.loads(json_str)",
  "        else:",
  "            result = {'output': out[-300:]}",
  "    except Exception as e:",
  "        result = {'error': str(e)}",
  "print(json.dumps(result))",
].join('\n');

const vnodes = [
  { id: 'v1', type: 'input', position: { x: 80, y: 220 }, data: { label: 'Video Prompt', config: { input: 'Broly SS4, green hair, muscular, anime' } } },
  { id: 'v2', type: 'code', position: { x: 380, y: 220 }, data: { label: 'Generate Video', config: { language: 'python', code: vidCode, timeout: 300000 } } },
  { id: 'v3', type: 'output', position: { x: 700, y: 220 }, data: { label: 'Video Result' } }
];
const vedges = [
  { id: 've1', source: 'v1', target: 'v2' },
  { id: 've2', source: 'v2', target: 'v3' }
];

const r2 = db.prepare('INSERT INTO workflows (user_id, name, nodes, edges) VALUES (?, ?, ?, ?)').run(1, '文生视频工作流', JSON.stringify(vnodes), JSON.stringify(vedges));
console.log('✅ 文生视频工作流 ID:', r2.lastInsertRowid);
console.log('\n现在打开 Local Canvas，说："加载文生图工作流" 即可还原');
db.close();
