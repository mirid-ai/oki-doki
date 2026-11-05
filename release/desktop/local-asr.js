'use strict';
// Explicit desktop transcription: bounded PCM in memory, sent to CLI stdin.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MODEL = 'tdt_ctc-110m-q4_k.gguf';
const ENGINE = 'parakeet-cpp:tdt_ctc-110m:q4_k';
const MAX_WAV = 44 + 16000 * 2 * 60;
const MAX_REQUEST = MAX_WAV + 65536;
const MAX_OUTPUT = 128 * 1024;

function selection() {
  if (process.platform === 'linux' && process.arch === 'x64') return ['linux-x64', 'parakeet-cli'];
  if (process.platform === 'win32' && process.arch === 'x64') return ['win32-x64', 'parakeet-cli.exe'];
  if (process.platform === 'darwin' && ['arm64', 'x64'].includes(process.arch)) return [`darwin-${process.arch}`, 'parakeet-cli'];
  return null;
}
function reply(res, status, data) {
  if (res.destroyed || res.writableEnded) return;
  const out = Buffer.from(JSON.stringify(data));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': out.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(out);
}
function readRequest(req) {
  return new Promise((resolve, reject) => {
    let length = 0, chunks = [], overflow = false;
    req.on('data', chunk => { length += chunk.length; if (length > MAX_REQUEST) { chunks = []; overflow = true; } else if (!overflow) chunks.push(chunk); });
    req.on('end', () => overflow ? reject(new Error('Recording is too large.')) : resolve(Buffer.concat(chunks)));
    req.on('error', reject); req.on('aborted', () => reject(new Error('Recording was cancelled.')));
  });
}
// The game's recorder emits exactly this canonical 16 kHz mono PCM16 WAV.
function validateWav(wav) {
  if (!Buffer.isBuffer(wav) || wav.length <= 44 || wav.length > MAX_WAV ||
      wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE' ||
      wav.readUInt32LE(4) !== wav.length - 8 || wav.toString('ascii', 12, 16) !== 'fmt ' ||
      wav.readUInt32LE(16) !== 16 || wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 ||
      wav.readUInt32LE(24) !== 16000 || wav.readUInt32LE(28) !== 32000 || wav.readUInt16LE(32) !== 2 ||
      wav.readUInt16LE(34) !== 16 || wav.toString('ascii', 36, 40) !== 'data' ||
      wav.readUInt32LE(40) !== wav.length - 44 || (wav.length - 44) % 2) throw new Error('Expected a short 16 kHz mono PCM WAV recording.');
}

function createLocalAsr({ origin, assetRoot, startProcess = spawn, timeoutMs = 120000 } = {}) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Local ASR requires the desktop loopback origin.');
  const chosen = selection();
  const runner = chosen && path.join(assetRoot, 'asr-runners', ...chosen);
  const model = path.join(assetRoot, 'asr-models', MODEL);
  let active = null, stopped = false, busy = false;
  function available() {
    try {
      return Boolean(runner && fs.lstatSync(path.join(assetRoot, 'asr-runners')).isDirectory() &&
        fs.lstatSync(path.join(assetRoot, 'asr-runners', chosen[0])).isDirectory() &&
        fs.lstatSync(path.join(assetRoot, 'asr-models')).isDirectory() &&
        fs.lstatSync(runner).isFile() && fs.lstatSync(model).isFile());
    } catch { return false; }
  }
  async function transcribe(wav, res) {
    return new Promise((resolve, reject) => {
      const child = startProcess(runner, ['transcribe', '--model', model, '--input', '-', '--decoder', 'tdt', '--threads', '4', '--json'],
        { cwd: path.dirname(runner), stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
      active = child;
      let output = [], bytes = 0, finished = false;
      const finish = (error, value) => { if (finished) return; finished = true; clearTimeout(timer); if (active === child) active = null; error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => { child.kill(); finish(new Error('Transcription timed out.')); }, timeoutMs);
      res.on('close', () => { if (!res.writableEnded) { child.kill(); finish(new Error('Transcription cancelled.')); } });
      child.once('error', error => finish(error));
      child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > MAX_OUTPUT) { child.kill(); finish(new Error('Transcription output is too large.')); } else output.push(chunk); });
      child.stdout.on('error', error => finish(error));
      child.stdin.on('error', error => finish(error));
      child.once('close', code => {
        if (code !== 0) return finish(new Error('Transcription failed.'));
        try { const data = JSON.parse(Buffer.concat(output).toString('utf8')); if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 20000) throw new Error('No speech recognized.'); finish(null, data.text.trim()); }
        catch (error) { finish(error); }
      });
      child.stdin.end(wav);
    });
  }
  async function handle(req, res) {
    if (req.headers.host !== parsed.host) return reply(res, 403, { error: 'Invalid host.' });
    let url; try { url = new URL(req.url, origin); } catch { return reply(res, 400, { error: 'Invalid URL.' }); }
    if (url.pathname === '/local-asr/status' && req.method === 'GET' && !url.search && !url.hash)
      return reply(res, 200, { available: !stopped && available(), engine: ENGINE });
    if (url.pathname !== '/local-asr/transcribe' || req.method !== 'POST' || req.headers.origin !== origin ||
        !/^multipart\/form-data\s*;/i.test(req.headers['content-type'] || '') || url.hash ||
        (url.search && (url.searchParams.size !== 1 || url.searchParams.get('engine') !== ENGINE)))
      return reply(res, 403, { error: 'Invalid transcription request.' });
    if (stopped || !available()) return reply(res, 503, { error: 'Local transcription is unavailable.' });
    if (busy) return reply(res, 429, { error: 'Local transcription is busy.' });
    busy = true;
    try {
      const data = await readRequest(req);
      const form = await new Request('http://127.0.0.1/', { method: 'POST', headers: { 'Content-Type': req.headers['content-type'] }, body: data }).formData();
      const fields = [...form.entries()];
      if (fields.length !== 1 || fields[0][0] !== 'file' || !(fields[0][1] instanceof Blob)) throw new Error('Expected one WAV recording.');
      const wav = Buffer.from(await fields[0][1].arrayBuffer());
      validateWav(wav);
      const text = await transcribe(wav, res);
      reply(res, 200, { text });
    } catch { reply(res, 422, { error: 'Could not transcribe that recording.' }); }
    finally { busy = false; }
  }
  function close() { stopped = true; if (active) active.kill(); }
  return { owns: p => typeof p === 'string' && p.startsWith('/local-asr/'), handle, close };
}
module.exports = { createLocalAsr, validateWav, ENGINE, MODEL };
