import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';

const db = new Database(path.join(os.homedir(), '.localcanvas', 'localcanvas.db'));
const wfs = db.prepare('SELECT id, name, nodes, edges FROM workflows WHERE name LIKE ? OR name LIKE ?').all('%SSD-1B%', '%文生%');
for (const w of wfs) {
  const n = JSON.parse(w.nodes);
  const e = JSON.parse(w.edges);
  console.log('#' + w.id + ':', w.name, '| nodes:', n.length, 'edges:', e.length);
  for (const node of n) console.log('  ' + node.type + ' - ' + (node.data?.label || ''));
  console.log('  edges:', e.map(x => x.source + '>' + x.target).join(', '));
}
db.close();
