#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
: "${EMSDK:?Set EMSDK to the root of the pinned 3.1.64 emsdk and activate it first}"
printf '%s  %s\n' e6b84b52a87b3ad72885331bd942b2adecd70c384fa4ecfbe10aae7d9afd5e21 "$here/espeak-ng-source.tar.gz" | sha256sum -c -
if ! emcc --version | head -1 | grep -q '3\.1\.64'; then echo 'Emscripten 3.1.64 required' >&2; exit 1; fi
if [ -e "$here/build" ]; then echo 'Remove or move build/ before rebuilding' >&2; exit 1; fi
mkdir -p "$here/build/src" "$here/build/data/lang" "$here/build/data/voices" "$here/build/output"
tar xzf "$here/espeak-ng-source.tar.gz" --strip-components=1 -C "$here/build/src"
for change in "$here"/patches/*.patch; do patch -d "$here/build/src" -p1 < "$change"; done
options=(-DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/usr -DUSE_LIBSONIC=OFF -DUSE_LIBPCAUDIO=OFF -DUSE_MBROLA=OFF -DUSE_SPEECHPLAYER=OFF -DUSE_KLATT=OFF -DUSE_ASYNC=OFF)
cmake -S "$here/build/src" -B "$here/build/native" "${options[@]}"
cmake --build "$here/build/native" --target data -j "${JOBS:-4}"
emcmake cmake -S "$here/build/src" -B "$here/build/wasm" "${options[@]}"
cmake --build "$here/build/wasm" --target espeak-ng -j "${JOBS:-4}"
cp "$here/build/native/espeak-ng-data/"{phondata,phonindex,phontab,intonations,en_dict} "$here/build/data/"
cp -a "$here/build/native/espeak-ng-data/lang/gmw" "$here/build/data/lang/"
cp -a "$here/build/native/espeak-ng-data/voices/!v" "$here/build/data/voices/"
emcc -O3 "$here/adapter.c" -I"$here/build/src/src/include" \
 "$here/build/wasm/src/libespeak-ng/libespeak-ng.a" "$here/build/wasm/src/ucd-tools/libucd.a" \
 -s MODULARIZE=1 -s EXPORT_ES6=1 -s SINGLE_FILE=1 -s ENVIRONMENT=web,worker \
 -s FORCE_FILESYSTEM=1 -s EXPORTED_FUNCTIONS='["_malloc","_free","_oki_init","_oki_synthesize"]' \
 -s EXPORTED_RUNTIME_METHODS='["ccall","FS"]' \
 --embed-file "$here/build/data@/usr/share/espeak-ng-data" -o "$here/build/output/espeak.mjs"
cp "$here/index.js" "$here/build/output/index.js"
sha256sum "$here/build/output/espeak.mjs"
