#!/usr/bin/env python3
"""Serve the app locally with caching switched off.

`python -m http.server` sends no Cache-Control header, so the browser guesses
how long to keep each file and ES modules come back from its cache after an
edit: the page then runs a mix of old and new code. This is the same server
with `Cache-Control: no-store` on every response. Development only; GitHub
Pages does its own caching, which the ?v= stamps handle.

    python tools/serve.py            # port 8790
    python tools/serve.py 8791
"""
import http.server
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    NoCache.extensions_map.update({'.js': 'text/javascript', '.mjs': 'text/javascript'})
    with Server(('', port), NoCache) as httpd:
        print(f'Serving {ROOT} on http://localhost:{port} (no-store)')
        httpd.serve_forever()
