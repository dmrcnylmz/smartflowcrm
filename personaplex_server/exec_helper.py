#!/usr/bin/env python3
"""Exec Helper - Adds a /exec endpoint to run commands on the pod"""
import subprocess, json
from http.server import HTTPServer, BaseHTTPRequestHandler

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        cmd = body.get('cmd', 'echo no command')
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120, cwd='/workspace/smartflow')
            out = {'stdout': result.stdout, 'stderr': result.stderr, 'code': result.returncode}
        except Exception as e:
            out = {'error': str(e)}
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(out).encode())
    def log_message(self, format, *args): pass

print("Exec helper on port 8997")
HTTPServer(('0.0.0.0', 8997), H).serve_forever()
