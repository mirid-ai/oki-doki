#!/usr/bin/env python3
"""Serve the game and optional, non-secret settings for its local launcher."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import urlsplit


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, setup=None, setup_file=None, **kwargs):
        self.launcher_config = setup
        self.launcher_config_file = setup_file
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if urlsplit(self.path).path == '/.well-known/oki-doki-local.json':
            setup = self.launcher_config
            if self.launcher_config_file is not None:
                try:
                    setup = json.loads(self.launcher_config_file.read_text(encoding='utf-8'))
                except (OSError, ValueError):
                    self.send_error(503, 'Local launcher settings temporarily unavailable')
                    return
            if setup is None or not any(setup.get(key) is not None for key in ('miridPort', 'kokoroPort', 'nanoPort')):
                self.send_error(404)
                return
            body = json.dumps(setup).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--setup-json')
    parser.add_argument('--setup-file', type=Path)
    args = parser.parse_args()
    setup = json.loads(args.setup_json) if args.setup_json else None
    handler = partial(Handler, directory=str(args.directory), setup=setup, setup_file=args.setup_file)
    ThreadingHTTPServer(('127.0.0.1', args.port), handler).serve_forever()


if __name__ == '__main__':
    main()
