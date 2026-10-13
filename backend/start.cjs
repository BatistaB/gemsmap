// Cross-platform launcher used by `npm run backend`: runs backend/run.py with the backend venv.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const venvPy = process.platform === 'win32' ? path.join(dir, '.venv', 'Scripts', 'python.exe') : path.join(dir, '.venv', 'bin', 'python');
const py = fs.existsSync(venvPy) ? venvPy : (process.platform === 'win32' ? 'python' : 'python3');
if (py !== venvPy) console.warn('[backend] backend/.venv not found — using system Python. Run `npm run backend:setup` first.');
const child = spawn(py, [path.join(dir, 'run.py'), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
child.on('exit', (code) => process.exit(code ?? 0));
