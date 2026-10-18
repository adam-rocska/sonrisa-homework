#!/usr/bin/env python3
"""Local visual-review fixture. Never shipped in the extension bundle."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / 'build/chrome-mv3-prod'
FIXTURE = Path(__file__).with_name('preview-fixture.js').read_text()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BUILD), **kwargs)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def do_GET(self):
        if self.path.split('?')[0] in ('/', '/options.html'):
            html = (BUILD / 'options.html').read_text()
            html = html.replace('<head>', '<head><script>' + FIXTURE + '</script>', 1)
            html = html.replace('<body>', '<body><div role="note" style="padding:10px 24px;background:#fff1cc;color:#493900;font:600 16px system-ui">LOCAL UI PREVIEW · Fictional data · No real sign-in or deliveries</div>', 1)
            body = html.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers(); self.wfile.write(body)
        else:
            super().do_GET()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--port', type=int, default=4173)
    args = parser.parse_args()
    print(f'Local-only UI preview: http://127.0.0.1:{args.port}/options.html', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
