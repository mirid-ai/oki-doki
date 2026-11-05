'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createLocalAsr, validateWav, MODEL, ENGINE } = require('./local-asr.js');

function wav() {
  const b = Buffer.alloc(44 + 3200);
  b.write('RIFF', 0); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40);
  return b;
}
function fakeSpawn() {
  const p = new EventEmitter(); p.stdin = new PassThrough(); p.stdout = new PassThrough();
  p.kill = () => p.emit('close', 1);
  p.stdin.on('data', () => {});
  p.stdin.on('end', () => { p.stdout.end(JSON.stringify({ text: 'A synthetic reply.' })); p.emit('close', 0); });
  return p;
}
test('local ASR validates WAV and restricts requests to the exact origin', async () => {
  const audio = wav(); validateWav(audio);
  const bad = Buffer.from(audio); bad.writeUInt32LE(44100, 24);
  assert.throws(() => validateWav(bad));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oki-asr-unit-'));
  const platform = process.platform === 'darwin' ? `darwin-${process.arch}` : process.platform === 'win32' ? 'win32-x64' : 'linux-x64';
  const cli = process.platform === 'win32' ? 'parakeet-cli.exe' : 'parakeet-cli';
  fs.mkdirSync(path.join(dir, 'asr-runners', platform), { recursive: true });
  fs.mkdirSync(path.join(dir, 'asr-models'));
  fs.writeFileSync(path.join(dir, 'asr-runners', platform, cli), 'fixture');
  fs.writeFileSync(path.join(dir, 'asr-models', MODEL), 'fixture');
  const host = 'http://127.0.0.1:19414';
  const asr = createLocalAsr({ origin: host, assetRoot: dir, startProcess: fakeSpawn });
  const server = http.createServer((req, res) => void asr.handle(req, res));
  await new Promise(resolve => server.listen(19414, '127.0.0.1', resolve));
  try {
    assert.equal((await (await fetch(host + '/local-asr/status')).json()).available, true);
    const data = () => { const f = new FormData(); f.append('file', new Blob([audio], { type: 'audio/wav' }), 'test.wav'); return f; };
    let r = await fetch(host + '/local-asr/transcribe?engine=' + encodeURIComponent(ENGINE), { method: 'POST', headers: { Origin: 'https://unrelated.example' }, body: data() });
    assert.equal(r.status, 403);
    r = await fetch(host + '/local-asr/transcribe?engine=' + encodeURIComponent(ENGINE), { method: 'POST', headers: { Origin: host }, body: data() });
    assert.equal(r.status, 200); assert.equal((await r.json()).text, 'A synthetic reply.');
    const wrong = new FormData(); wrong.append('file', new Blob([bad], { type: 'audio/wav' }), 'bad.wav');
    r = await fetch(host + '/local-asr/transcribe?engine=' + encodeURIComponent(ENGINE), { method: 'POST', headers: { Origin: host }, body: wrong });
    assert.equal(r.status, 422);
    asr.close(); assert.equal((await (await fetch(host + '/local-asr/status')).json()).available, false);
  } finally { asr.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
});
