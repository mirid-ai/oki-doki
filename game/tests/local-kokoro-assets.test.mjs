import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// iOS Capacitor explicitly recognises .js. Do not rely on its OS-specific
// MIME database recognising .mjs when ONNX imports the local runtime module.
const asset = name => new URL(`../assets/kokoro-local/${name}`, import.meta.url);
const [source, bundled, js, mjs, wasm] = await Promise.all([
  readFile(asset('worker-source.js'), 'utf8'),
  readFile(asset('worker.js'), 'utf8'),
  readFile(asset('runtime/ort-wasm-simd-threaded.jsep.js')),
  readFile(asset('runtime/ort-wasm-simd-threaded.jsep.mjs')),
  readFile(asset('runtime/ort-wasm-simd-threaded.jsep.wasm'))
]);
assert.match(source, /mjs:\s*new URL\('\.\/runtime\/ort-wasm-simd-threaded\.jsep\.js'/);
assert.ok(bundled.includes('./runtime/ort-wasm-simd-threaded.jsep.js'));
assert.ok(bundled.includes('./runtime/ort-wasm-simd-threaded.jsep.wasm'));
const hash = data => createHash('sha256').update(data).digest('hex');
assert.equal(hash(js), hash(mjs), 'The JavaScript alias must match the ONNX runtime module.');
assert.ok(wasm.length > 1_000_000, 'The ONNX WASM binary must be bundled.');
