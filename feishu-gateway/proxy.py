# -*- coding: utf-8 -*-
"""反向代理 v2 - 合并 Flask(5678) + Wiki(3000) → 8088"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request, urllib.error, sys, traceback

FLASK = "http://127.0.0.1:5678"
WIKI  = "http://127.0.0.1:3000"

class Proxy(BaseHTTPRequestHandler):
    def do_request(self, method):
        path = self.path
        target = FLASK if (path.startswith("/feishu") or path.startswith("/health")) else WIKI
        url = target + path

        body = None
        cl = int(self.headers.get("Content-Length", 0))
        if cl > 0:
            body = self.rfile.read(cl)

        req = urllib.request.Request(url, data=body, method=method)
        for h in ["Content-Type", "Authorization", "Accept", "User-Agent"]:
            if h in self.headers:
                req.add_header(h, self.headers[h])

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                self.send_response(resp.status)
                for k, v in resp.getheaders():
                    if k.lower() not in ("transfer-encoding", "connection"):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            print(f"[PROXY ERROR] {method} {path}: {e}", flush=True)
            traceback.print_exc()
            self.send_response(502)
            self.end_headers()
            self.wfile.write(f"Proxy Error: {e}".encode())

    do_GET  = lambda s: s.do_request("GET")
    do_POST = lambda s: s.do_request("POST")
    do_OPTIONS = lambda s: s.do_request("OPTIONS")
    def log_message(self, fmt, *args):
        pass

if __name__ == "__main__":
    print("Proxy v2: 8088 → 5678(Feishu) / 3000(Wiki)", flush=True)
    HTTPServer(("0.0.0.0", 8088), Proxy).serve_forever()
