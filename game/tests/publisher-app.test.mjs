import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

for (const { title, creator, expected } of [
  {
    title: 'normal players keep the publisher voice across settings and presets',
    creator: '0',
    expected: /normal player cannot displace the publisher voice through settings or presets/
  },
  {
    title: 'creator audition can preview, override and reset the publisher voice for a session',
    creator: '1',
    expected: /publisher voices route, preview, override and reset independently/
  }
]) {
  test(title, async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./test.mjs', import.meta.url))], {
      env: { ...process.env, OKI_TEST_PUBLISHER_VOICE: '1', OKI_TEST_CREATOR: creator },
      timeout: 60000,
      maxBuffer: 1024 * 1024
    });
    assert.match(stdout, expected);
    assert.match(stdout, /All offline tests passed/);
  });
}
