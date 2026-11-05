#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
cd "$here"
[ -f build/output/espeak.mjs ] || { echo 'First run ./build.sh to build eSpeak from source.' >&2; exit 1; }
npm ci --ignore-scripts --no-audit --no-fund
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const file='node_modules/kokoro-js/dist/kokoro.js';
const source=readFileSync(file,'utf8');
const original='`https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${e}.bin`';
const replacement='new URL(`./models/kokoro/voices/${e}.bin`,import.meta.url).href';
if(source.split(original).length!==2)throw new Error('Unexpected Kokoro voice URL; refusing to patch');
writeFileSync(file,source.replace(original,replacement));
JS
cp build/output/espeak.mjs node_modules/phonemizer/espeak.mjs
cp index.js node_modules/phonemizer/index.js
printf '%s\n' '{"name":"phonemizer","type":"module","exports":"./index.js"}' > node_modules/phonemizer/package.json
cp ../worker-source.js build/worker-source.js
node_modules/.bin/esbuild build/worker-source.js --bundle --format=esm --platform=browser --minify --outfile=worker-build.js
sha256sum worker-build.js
