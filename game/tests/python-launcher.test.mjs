import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runPython } from '../mobile/tools/run_python.mjs';

function fixture(results) {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return results.shift();
  };
  return { spawn, calls };
}
const missing = () => ({ error: Object.assign(new Error('missing'), { code: 'ENOENT' }) });

test('Windows tries the Python 3 launcher and passes literal arguments', () => {
  const f = fixture([{ status: 0 }]);
  assert.deepEqual(runPython(['tools/stage.py', 'spaces & symbols'], { platform: 'win32', spawn: f.spawn }), { status: 0 });
  assert.deepEqual(f.calls, [{ command: 'py', args: ['-3', 'tools/stage.py', 'spaces & symbols'], options: { stdio: 'inherit', shell: false } }]);
});

test('Windows and Unix use their fallback only if the primary executable is missing', () => {
  for (const [platform, expected] of [['win32', ['py', 'python']], ['linux', ['python3', 'python']], ['darwin', ['python3', 'python']]]) {
    const f = fixture([missing(), { status: 0 }]);
    assert.deepEqual(runPython(['tools/stage.py'], { platform, spawn: f.spawn }), { status: 0 });
    assert.deepEqual(f.calls.map(call => call.command), expected);
    assert.deepEqual(f.calls[1].args, ['tools/stage.py']);
  }
});

test('script failures and signals are reported without running the script again', () => {
  for (const [result, expected] of [[{ status: 17 }, 17], [{ signal: 'SIGTERM' }, 1], [{ error: new Error('spawn failed') }, 1]]) {
    const f = fixture([result]);
    assert.equal(runPython(['tools/configure_native.py'], { platform: 'win32', spawn: f.spawn }).status, expected);
    assert.equal(f.calls.length, 1);
  }
});

test('a missing interpreter reports how to fix it', () => {
  const f = fixture([missing(), missing()]);
  const result = runPython(['tools/stage.py'], { platform: 'linux', spawn: f.spawn });
  assert.equal(result.status, 1);
  assert.match(result.message, /Python 3 was not found/);
});
