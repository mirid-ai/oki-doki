'use strict';
// Run with Node 22+: node --test release/desktop/test_local_ai.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createLocalAi, findSharedRuntime, MODEL } = require('./local-ai');

const worker = `
const http=require('node:http');let checks=0;
http.createServer((req,res)=>{
 if(req.url==='/health'){if(++checks===1)setTimeout(()=>res.writeHead(200).end('{}'),800);else res.writeHead(200).end('{}');return;}
 if(req.headers.authorization!=='Bearer '+process.env.LLAMA_API_KEY){res.writeHead(401).end('{}');return;}
 if(req.url!=='/v1/chat/completions'){res.writeHead(404).end('{}');return;}
 let body='';req.on('data',c=>body+=c);req.on('end',()=>{
   const request=JSON.parse(body);
   setTimeout(()=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({choices:[{message:{role:'assistant',content:request.messages[0].content}}]})),100);
 });
}).listen(Number(process.argv[1]),'127.0.0.1');`;

test('local desktop AI is opt-in, origin-restricted, bounded and isolated', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oki-local-ai-'));
  const platform = process.platform === 'win32' ? 'win32-x64' : process.platform === 'darwin' ? `darwin-${process.arch}` : 'linux-x64';
  const executable = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  fs.mkdirSync(path.join(root, 'models'), { recursive: true });
  fs.mkdirSync(path.join(root, 'runners', platform), { recursive: true });
  fs.writeFileSync(path.join(root, 'models', MODEL), 'fixture');
  fs.writeFileSync(path.join(root, 'runners', platform, executable), 'fixture');
  let ai, children = [], origin, workerPort;
  const server = http.createServer((req, res) => { void ai.handle(req, res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  ai = createLocalAi({ origin, assetRoot: root, startupTimeout: 5000,
    startProcess: (_exe, args, options) => {
      const port = args[args.indexOf('--port') + 1];
      workerPort = Number(port);
      const child = spawn(process.execPath, ['-e', worker, port], { env: options.env, stdio: 'ignore' });
      children.push(child); return child;
    }
  });
  const call = (route, options = {}) => fetch(origin + route, options);
  const post = (route, value, requestOrigin = origin) => call(route, { method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  try {
    const initial = await (await call('/local-ai/status')).json();
    assert.equal(initial.available, true); assert.equal(initial.ready, false); assert.equal(children.length, 0);
    assert.equal((await post('/local-ai/start', {}, 'https://other.example')).status, 403);
    assert.equal((await post('/local-ai/v1/chat/completions', {messages: [{role:'user',content:'hello'}]})).status, 503);
    assert.equal(children.length, 0);
    const starts = await Promise.all([post('/local-ai/start', {}), post('/local-ai/start', {})]);
    for (const start of starts) { assert.equal(start.status, 200); assert.deepEqual(await start.json(), {ready: true, model: MODEL}); }
    assert.equal(children.length, 1, 'concurrent starts and slow health must not spawn duplicate workers');
    assert.equal((await (await call('/local-ai/status')).json()).ready, true);
    const direct = await fetch(`http://127.0.0.1:${workerPort}/v1/chat/completions`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({messages:[{role:'user',content:'hello'}]}) });
    assert.equal(direct.status, 401, 'the worker must reject requests without its private key');
    assert.equal((await post('/local-ai/v1/chat/completions', {messages: [{role:'user',content:'x'.repeat(100000)}]})).status, 400);
    assert.equal((await post('/local-ai/v1/chat/completions', {messages: [{role:'user',content:'hello'}],stream:true})).status, 400);
    const first = post('/local-ai/v1/chat/completions', {messages: [{role:'user',content:'hello'}]});
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal((await post('/local-ai/v1/chat/completions', {messages:[{role:'user',content:'second'}]})).status,429);
    const response = await first; assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.choices[0].message.content, 'hello');
    assert.ok(!JSON.stringify(result).includes('LLAMA_API_KEY'));
    assert.equal((await post('/local-ai/not-a-route', {})).status, 404);
  } finally {
    ai.close(); await new Promise(resolve => server.close(resolve));
    for (const child of children) if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(root, {recursive:true, force:true});
  }
});

test('shared runtime lookup requires the exact handoff layout and ordinary files', () => {
  if (process.platform !== 'linux' || process.arch !== 'x64') return;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oki-layout-'));
  try {
    const runtime = path.join(root, 'local-ai');
    const app = path.join(root, 'linux', 'Oki-Doki-Linux', 'resources', 'app');
    fs.mkdirSync(app, {recursive: true});
    fs.mkdirSync(path.join(runtime, 'models'), {recursive: true});
    fs.mkdirSync(path.join(runtime, 'runners/linux-x64'), {recursive: true});
    fs.writeFileSync(path.join(root, 'START-HERE.txt'), 'fixture');
    fs.writeFileSync(path.join(runtime, 'models', MODEL), 'fixture');
    fs.writeFileSync(path.join(runtime, 'runners/linux-x64/llama-server'), 'fixture');
    fs.writeFileSync(path.join(runtime, '.oki-local-ai-runtime.json'), JSON.stringify({version:1,model:MODEL}));
    assert.equal(findSharedRuntime(app), runtime);
    assert.equal(findSharedRuntime(path.join(root, 'some-other-app')), null);
    fs.unlinkSync(path.join(runtime, 'models', MODEL));
    fs.symlinkSync(path.join(root, 'START-HERE.txt'), path.join(runtime, 'models', MODEL));
    assert.equal(findSharedRuntime(app), null, 'a symlinked model must not escape the runtime');
    fs.unlinkSync(path.join(root, 'START-HERE.txt'));
    assert.equal(findSharedRuntime(app), null);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('renamed standalone desktop folder finds only its own marked runtime', () => {
  if (process.platform !== 'linux' || process.arch !== 'x64') return;
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'oki-standalone-'));
  try {
    const root = path.join(parent, 'Renamed Oki Doki');
    const app = path.join(root, 'resources', 'app');
    const runtime = path.join(root, 'local-ai');
    fs.mkdirSync(app, {recursive: true});
    fs.mkdirSync(path.join(runtime, 'models'), {recursive: true});
    fs.mkdirSync(path.join(runtime, 'runners/linux-x64'), {recursive: true});
    fs.writeFileSync(path.join(root, 'START-HERE.txt'), 'fixture');
    fs.writeFileSync(path.join(runtime, 'models', MODEL), 'fixture');
    fs.writeFileSync(path.join(runtime, 'runners/linux-x64/llama-server'), 'fixture');
    fs.writeFileSync(path.join(runtime, '.oki-local-ai-runtime.json'), JSON.stringify({version:1,model:MODEL}));
    assert.equal(findSharedRuntime(app), runtime);
    fs.unlinkSync(path.join(root, 'START-HERE.txt'));
    assert.equal(findSharedRuntime(app), null, 'an unmarked directory is not accepted');
    fs.writeFileSync(path.join(root, 'START-HERE.txt'), 'fixture');
    fs.unlinkSync(path.join(runtime, 'models', MODEL));
    fs.symlinkSync(path.join(root, 'START-HERE.txt'), path.join(runtime, 'models', MODEL));
    assert.equal(findSharedRuntime(app), null, 'a symlinked model is not accepted');
  } finally { fs.rmSync(parent, {recursive:true, force:true}); }
});
