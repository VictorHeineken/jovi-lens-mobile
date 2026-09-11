import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

// The backend (server/local-api.js, api/, .env) lives at the repo root,
// shared with the native app — this file itself lives at web/scripts/.
const repoRoot = resolve(import.meta.dirname, '../..');
const webRoot = resolve(import.meta.dirname, '..');

const envFiles = ['.env', '.env.local'].filter((file) => existsSync(resolve(repoRoot, file)));
const apiArgs = [
  ...envFiles.map((file) => `--env-file=${resolve(repoRoot, file)}`),
  resolve(repoRoot, 'server/local-api.js'),
];

const api = spawn(process.execPath, apiArgs, { cwd: repoRoot, env: process.env, stdio: 'inherit' });
const web = spawn(process.execPath, [resolve(webRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], { cwd: webRoot, env: process.env, stdio: 'inherit' });
const children = [api, web];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((child) => child.kill('SIGTERM'));
  setTimeout(() => process.exit(code), 300);
}

children.forEach((child) => child.on('exit', (code) => {
  if (!shuttingDown) shutdown(code || 1);
}));

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
