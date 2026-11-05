#!/usr/bin/env python3
"""Preview the built site locally, serving only the prepared release ZIPs."""
from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

SITE = Path(__file__).resolve().parent
DIST = SITE / 'dist'
ARCHIVES = {
    'windows': SITE.parent / 'game/dist/oki-doki-windows-complete.zip',
    'linux': SITE.parent / 'game/dist/oki-doki-linux-complete.zip',
    'source': SITE.parent / 'game/dist/oki-doki-complete-source.zip',
}
ROUTES = {f'/downloads/{path.name}': path for path in ARCHIVES.values()}


def available(path):
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size < 4:
            return False
        with path.open('rb') as stream:
            return stream.read(4) == b'PK\x03\x04'
    except OSError:
        return False


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def permitted_host(self):
        port = self.server.server_port
        return self.headers.get('Host', '').lower() in {f'127.0.0.1:{port}', f'localhost:{port}'}

    def do_HEAD(self):
        self.handle_request(head=True)

    def do_GET(self):
        self.handle_request(head=False)

    def handle_request(self, head):
        if not self.permitted_host():
            self.send_error(403)
            return
        path = urlsplit(self.path).path
        if path == '/desktop-releases.json':
            data = {name: f'/downloads/{file.name}' if available(file) else None for name, file in ARCHIVES.items()}
            payload = json.dumps(data).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            if not head:
                self.wfile.write(payload)
            return
        if path in ROUTES:
            self.download(ROUTES[path], head)
            return
        if head:
            super().do_HEAD()
        else:
            super().do_GET()

    def download(self, path, head):
        if not available(path):
            self.send_error(404)
            return
        size = path.stat().st_size
        start, end, status = 0, size - 1, 200
        requested = self.headers.get('Range')
        if requested:
            match = re.fullmatch(r'bytes=(\d+)-(\d*)', requested.strip())
            if not match or int(match.group(1)) >= size:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{size}')
                self.end_headers()
                return
            start = int(match.group(1))
            end = min(size - 1, int(match.group(2))) if match.group(2) else size - 1
            if end < start:
                self.send_error(416)
                return
            status = 206
        self.send_response(status)
        self.send_header('Content-Type', 'application/zip')
        self.send_header('Content-Disposition', f'attachment; filename="{path.name}"')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-store')
        if status == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        if head:
            return
        try:
            with path.open('rb') as stream:
                stream.seek(start)
                remaining = end - start + 1
                while remaining:
                    chunk = stream.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8890)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('Port must be between 1 and 65535.')
    if not (DIST / '.oki-site-generated').is_file():
        parser.error('Build the managed site first with python3 website/build.py.')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Local preview: http://127.0.0.1:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
