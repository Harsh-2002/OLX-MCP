#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverPath = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/index.js');
const child = spawn(process.execPath, [serverPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', error => {
  console.error('Failed to start OLX MCP:', error.message);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
