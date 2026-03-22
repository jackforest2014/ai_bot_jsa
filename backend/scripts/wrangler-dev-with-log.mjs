#!/usr/bin/env node
/**
 * 本地开发：启动 wrangler dev，并把子进程 stdout/stderr 原样追加到 backend/ai.log。
 * Cloudflare Worker 运行时无法写宿主机文件，因此用进程级 tee 做「全量日志落盘」。
 *
 * 用法：
 *   npm run dev:log
 *   npm run dev:log -- --port 8787
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, '..');
const logPath = resolve(backendRoot, 'ai.log');
const logStream = createWriteStream(logPath, { flags: 'a' });

const header = `\n${'='.repeat(72)}\n[${new Date().toISOString()}] wrangler dev (tee → ai.log)\n${'='.repeat(72)}\n`;
logStream.write(header);

const extraArgs = process.argv.slice(2);
const wranglerEntry = resolve(backendRoot, 'node_modules/wrangler/bin/wrangler.js');

const child = spawn(process.execPath, [wranglerEntry, 'dev', ...extraArgs], {
  cwd: backendRoot,
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
});

function pipeAndLog(stream, out, label) {
  stream.on('data', (chunk) => {
    out.write(chunk);
    logStream.write(chunk);
  });
}

pipeAndLog(child.stdout, process.stdout, 'out');
pipeAndLog(child.stderr, process.stderr, 'err');

child.on('error', (err) => {
  const line = `[wrangler-dev-with-log] spawn failed: ${err.message}\n`;
  process.stderr.write(line);
  logStream.write(line);
  logStream.end();
  process.exit(1);
});

function shutdown() {
  child.kill('SIGINT');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

child.on('close', (code, signal) => {
  const footer = `[${new Date().toISOString()}] wrangler dev exited code=${code} signal=${signal ?? ''}\n`;
  logStream.write(footer);
  logStream.end(() => process.exit(code ?? 0));
});
