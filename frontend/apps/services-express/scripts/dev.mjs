import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, watch } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const distEntry = path.resolve(process.cwd(), 'dist', 'index.js');
const bin = process.platform === 'win32' ? 'tsdown.cmd' : 'tsdown';
mkdirSync(path.dirname(distEntry), { recursive: true });

let serverProcess;
let restartTimer;

const stopServer = () => {
  if (!serverProcess) return;
  serverProcess.kill('SIGTERM');
  serverProcess = undefined;
};

const startServer = () => {
  if (!existsSync(distEntry)) return;
  stopServer();
  serverProcess = spawn('node', [distEntry], {
    stdio: 'inherit',
    env: process.env,
  });
};

const compiler = spawn(bin, ['--watch'], {
  stdio: 'inherit',
  env: process.env,
});

watch(path.dirname(distEntry), { recursive: true }, (_, filename) => {
  if (!filename?.endsWith('.js')) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    startServer();
  }, 200);
});

const shutdown = () => {
  stopServer();
  compiler.kill('SIGTERM');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
