#!/usr/bin/env python3
"""Small dev server for tablefolk.world.

Serves the static project files. The browser downloads WebLLM model files
directly from HuggingFace and caches them in IndexedDB (no server proxy needed).

Run:
    cd tablefolk
    python3 tablefolk_server.py 8000
"""

from __future__ import annotations

import http.server
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class TablefolkHandler(http.server.SimpleHTTPRequestHandler):
    server_version = "tablefolk-dev/0.3"
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # Entry points must be revalidated or browsers keep running an old
        # build: preflight.js carries every other file's ?v= version string.
        # Assets too: they have no version strings and get replaced in place
        # (revalidating locally is a cheap 304).
        path = self.path.split("?", 1)[0]
        if path.endswith((".html", "/", "preflight.js")) or "/assets/" in path:
            self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8000"))
    os.chdir(ROOT)
    print(f"Serving tablefolk.world on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), TablefolkHandler).serve_forever()
