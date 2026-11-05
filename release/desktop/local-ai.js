'use strict';
// Optional, explicitly started local inference for the desktop shell.
// This module does not touch any existing service, settings or saves.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const MODEL = 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf';
const PREFIX = '/local-ai/';
const LIMIT = 96 * 1024;
const MAX_RESPONSE = 2 * 1024 * 1024;

// Find a runtime only in the documented handoff or self-contained Windows
// layout. Do not search user profiles, PATH, or arbitrary model files.
function findSharedRuntime(appDirectory) {
  if (typeof appDirectory !== 'string' || !path.isAbsolute(appDirectory)) return null;
  const parts = path.resolve(appDirectory).split(path.sep);
  const patterns = [
    ['windows', 'Oki-Doki-Windows', 'resources', 'app'],
    ['linux', 'Oki-Doki-Linux', 'resources', 'app'],
    ['macos', 'Oki-Doki-macOS-arm64', 'Oki Doki.app', 'Contents', 'Resources', 'app'],
    ['macos', 'Oki-Doki-macOS-x64', 'Oki Doki.app', 'Contents', 'Resources', 'app']
  ];
  const matches = pattern => pattern.length < parts.length && pattern.every((part, i) => parts[parts.length - pattern.length + i] === part);
  const roots = patterns.filter(matches).map(pattern => parts.slice(0, -pattern.length).join(path.sep) || path.parse(appDirectory).root);
  // A standalone desktop archive places its marker and runtime next to the
  // executable. The marker and exact runtime structure are checked below, so
  // players may rename the extracted folder without losing local AI.
  if (matches(['resources', 'app'])) roots.push(path.resolve(appDirectory, '../..'));
  for (const root of roots) try {
    const runtime = path.join(root, 'local-ai');
    const ordinaryFile = file => { const stat = fs.lstatSync(file); return stat.isFile() && !stat.isSymbolicLink(); };
    const ordinaryDir = dir => { const stat = fs.lstatSync(dir); return stat.isDirectory() && !stat.isSymbolicLink(); };
    if (!ordinaryFile(path.join(root, 'START-HERE.txt')) || !ordinaryDir(runtime) ||
        !ordinaryDir(path.join(runtime, 'models')) || !ordinaryDir(path.join(runtime, 'runners')) ||
        !ordinaryFile(path.join(runtime, '.oki-local-ai-runtime.json')) || !ordinaryFile(path.join(runtime, 'models', MODEL))) continue;
    const marker = JSON.parse(fs.readFileSync(path.join(runtime, '.oki-local-ai-runtime.json'), 'utf8'));
    if (marker.version !== 1 || marker.model !== MODEL) continue;
    const selection = runnerName();
    if (!selection || !ordinaryDir(path.join(runtime, 'runners', selection[0])) ||
        !ordinaryFile(path.join(runtime, 'runners', ...selection))) continue;
    return runtime;
  } catch { /* Try the next explicitly allowed layout, if present. */ }
  return null;
}

function runnerName() {
  if (process.platform === 'win32' && process.arch === 'x64') return ['win32-x64', 'llama-server.exe'];
  if (process.platform === 'linux' && process.arch === 'x64') return ['linux-x64', 'llama-server'];
  if (process.platform === 'darwin' && ['x64', 'arm64'].includes(process.arch)) return [`darwin-${process.arch}`, 'llama-server'];
  return null;
}
function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(error => error ? reject(error) : resolve(port));
    });
  });
}
function json(res, code, value) {
  if (res.destroyed || res.writableEnded) return;
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
function body(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0, chunks = [], failed = false;
    req.on('data', part => {
      bytes += part.length;
      if (bytes > LIMIT) { failed = true; chunks = []; return; }
      if (!failed) chunks.push(part);
    });
    req.on('end', () => {
      if (failed) return reject(new Error('Request is too large.'));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('Invalid JSON.')); }
    });
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('Request was cancelled.')));
  });
}
function health(port, timeout = 500) {
  return new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/health', timeout }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

function createLocalAi({ origin, assetRoot, startupTimeout = 90000, startProcess = spawn, choosePort = freePort } = {}) {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/' || url.search || url.hash)
    throw new Error('Local AI requires the desktop loopback origin.');
  const host = url.host;
  const selection = runnerName();
  const runner = selection && path.join(assetRoot, 'runners', ...selection);
  const model = path.join(assetRoot, 'models', MODEL);
  let child = null, port = null, secret = null, starting = null, stopped = false, busy = false, ready = false;
  function available() {
    try { return Boolean(runner && fs.statSync(runner).isFile() && fs.statSync(model).isFile() && fs.statSync(model).size > 0); }
    catch { return false; }
  }
  async function start() {
    if (stopped) throw new Error('Local AI has stopped.');
    if (starting) return starting;
    // Never start a replacement while an owned worker is alive. A slow or
    // transiently failing health endpoint is not proof that it has stopped.
    if (child) {
      if (ready) return;
      throw new Error('Local AI is not ready.');
    }
    if (!available()) throw new Error('The local AI model or runner is not installed for this platform.');
    starting = (async () => {
      const selectedPort = await choosePort();
      const apiKey = crypto.randomBytes(32).toString('hex');
      const threads = Math.max(1, Math.min(4, os.availableParallelism?.() || os.cpus().length || 1));
      const processHandle = startProcess(runner, ['--model', model, '--host', '127.0.0.1', '--port', String(selectedPort),
        '--ctx-size', '4096', '--parallel', '1', '--threads', String(threads), '--no-webui',
        '--cors-origins', origin, '--log-disable'], {
        cwd: path.dirname(runner), env: { ...process.env, LLAMA_API_KEY: apiKey },
        stdio: 'ignore', windowsHide: true
      });
      child = processHandle; port = selectedPort; secret = apiKey;
      let exited = false;
      processHandle.once('error', () => { exited = true; });
      processHandle.once('exit', () => { exited = true; if (child === processHandle) { child = null; port = null; secret = null; ready = false; } });
      const deadline = Date.now() + startupTimeout;
      while (!exited && !stopped && Date.now() < deadline) {
        if (await health(selectedPort)) { ready = true; return; }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      if (!exited) processHandle.kill();
      if (child === processHandle) { child = null; port = null; secret = null; ready = false; }
      throw new Error(stopped ? 'Local AI has stopped.' : 'Local AI could not start.');
    })();
    try { await starting; } finally { starting = null; }
  }
  function forward(req, res, data) {
    return new Promise(resolve => {
      const payload = Buffer.from(JSON.stringify(data));
      const upstream = http.request({ hostname: '127.0.0.1', port, path: '/v1/chat/completions', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, Authorization: `Bearer ${secret}` } }, response => {
        let size = 0, chunks = [];
        response.on('data', chunk => {
          size += chunk.length;
          if (size > MAX_RESPONSE) { chunks = []; upstream.destroy(new Error('Response too large.')); response.destroy(); return; }
          chunks.push(chunk);
        });
        response.on('end', () => {
          if (!res.destroyed && !res.writableEnded) {
            const output = Buffer.concat(chunks);
            res.writeHead(response.statusCode || 502, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': output.length,
              'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
            res.end(output);
          }
          resolve();
        });
        response.on('error', () => { json(res, 502, { error: 'Local AI response failed.' }); resolve(); });
      });
      upstream.setTimeout(120000, () => upstream.destroy(new Error('Timed out.')));
      upstream.on('error', () => { json(res, 502, { error: 'Local AI request failed.' }); resolve(); });
      res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
      upstream.end(payload);
    });
  }
  async function handle(req, res) {
    if (req.headers.host !== host) return json(res, 403, { error: 'Invalid host.' });
    let url;
    try { url = new URL(req.url, origin); } catch { return json(res, 400, { error: 'Invalid local AI URL.' }); }
    if (url.search || url.hash) return json(res, 400, { error: 'Invalid local AI URL.' });
    if (url.pathname === PREFIX + 'status' && req.method === 'GET')
      return json(res, 200, { available: available(), ready, model: MODEL });
    if (req.method !== 'POST' || req.headers.origin !== origin || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || ''))
      return json(res, 403, { error: 'Invalid local AI request.' });
    if (url.pathname === PREFIX + 'start') {
      try { await body(req); await start(); return json(res, 200, { ready: true, model: MODEL }); }
      catch { return json(res, 503, { error: 'Local AI could not start.' }); }
    }
    if (url.pathname !== PREFIX + 'v1/chat/completions') return json(res, 404, { error: 'Not found.' });
    if (!ready || !child || !port || !secret) return json(res, 503, { error: 'Start local AI first.' });
    if (busy) return json(res, 429, { error: 'Local AI is already responding.' });
    busy = true;
    try {
      const data = await body(req);
      if (!data || typeof data !== 'object' || !Array.isArray(data.messages) || !data.messages.length || data.stream === true)
        return json(res, 400, { error: 'Invalid chat request.' });
      await forward(req, res, data);
    } catch { json(res, 400, { error: 'Invalid chat request.' }); }
    finally { busy = false; }
  }
  function close() { stopped = true; if (child) child.kill(); child = null; port = null; secret = null; ready = false; }
  return { owns: pathname => typeof pathname === 'string' && pathname.startsWith(PREFIX), handle, close };
}
module.exports = { createLocalAi, findSharedRuntime, MODEL };
