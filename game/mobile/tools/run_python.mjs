// Run the project's Python tools with the conventional interpreter for each
// platform. Never retry a script that ran and failed: it may have changed files.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function runPython(args, { platform = process.platform, spawn = spawnSync } = {}) {
  const candidates = platform === 'win32'
    ? [['py', '-3'], ['python']]
    : [['python3'], ['python']];
  for (const [command, ...prefix] of candidates) {
    const result = spawn(command, [...prefix, ...args], { stdio: 'inherit', shell: false });
    if (result.error?.code === 'ENOENT') continue;
    if (result.error) return { status: 1, message: `Could not start Python: ${result.error.message}` };
    if (result.signal) return { status: 1, message: `Python exited on signal ${result.signal}.` };
    return { status: result.status ?? 1 };
  }
  return { status: 1, message: 'Python 3 was not found. Install Python 3 and make it available on PATH.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length < 3) {
    console.error('Usage: node tools/run_python.mjs <script> [arguments...]');
    process.exitCode = 2;
  } else {
    const result = runPython(process.argv.slice(2));
    if (result.message) console.error(result.message);
    process.exitCode = result.status;
  }
}
