import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const envFiles = ['.env', '.env.local'].filter((file) => existsSync(resolve(projectRoot, file)));
const apiArgs = [
  ...envFiles.map((file) => `--env-file=${resolve(projectRoot, file)}`),
  resolve(projectRoot, 'server/local-api.js'),
];

const api = spawn(process.execPath, apiArgs, { cwd: projectRoot, env: process.env, stdio: 'inherit' });
const web = spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], { cwd: projectRoot, env: process.env, stdio: 'inherit' });
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
