const { spawn } = require('child_process');
const p = spawn('node', [
  'D:/localcanvas2/renderer/node_modules/vite/bin/vite.js',
  '--port', '5173',
  '--host'
], {
  cwd: 'D:/localcanvas2/renderer',
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
p.unref();
let out = '';
p.stdout.on('data', d => { out += d; if (out.includes('ready')) console.log('READY'); });
p.stderr.on('data', d => { /* ignore */ });
setTimeout(() => process.exit(0), 3000);
