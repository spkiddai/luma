import { spawn } from 'node:child_process';
import electron from 'electron';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' });
let app;
const cleanup = () => { app?.kill(); vite.kill(); };
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
for (let i = 0; i < 100; i++) {
  try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch { /* Wait for Vite. */ }
  await new Promise(r => setTimeout(r, 200));
}
app = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173' } });
app.on('exit', code => { vite.kill(); process.exit(code || 0); });
