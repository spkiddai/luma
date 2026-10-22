"""Hermetic core forwarding regression: no subscriptions, OS proxy changes or internet.
Checks HTTP, CONNECT, SOCKS5, concurrent integrity, reload during transfer and port reuse.
The measured loopback throughput is diagnostic, not an external-network speed claim.
"""
import concurrent.futures
import hashlib
import http.client
import http.server
import json
import os
from pathlib import Path
import secrets
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time

PAYLOAD = bytes(range(256)) * 65536  # 16 MiB, deterministic and non-compressible by transfer settings
EXPECTED = hashlib.sha256(PAYLOAD).hexdigest()

class Origin(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Length', str(len(PAYLOAD)))
        self.end_headers()
        for offset in range(0, len(PAYLOAD), 65536):
            self.wfile.write(PAYLOAD[offset:offset + 65536])
            if self.path == '/stream':
                time.sleep(0.002)
    def log_message(self, *_):
        pass

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

def recv_exact(sock, size):
    result = b''
    while len(result) < size:
        chunk = sock.recv(size - len(result))
        if not chunk:
            raise AssertionError('SOCKS handshake was truncated')
        result += chunk
    return result

def main():
    core = str(Path(sys.argv[1]).resolve())
    origin = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Origin)
    origin.daemon_threads = True
    threading.Thread(target=origin.serve_forever, daemon=True).start()
    origin_port = origin.server_port
    proxy, api = free_port(), free_port()
    secret = secrets.token_hex(24)
    with tempfile.TemporaryDirectory(prefix='luma-forwarding-test-') as directory:
        config_path = Path(directory) / 'runtime.json'
        config_path.write_text(json.dumps({'mixed-port': proxy, 'external-controller': f'127.0.0.1:{api}', 'secret': secret, 'allow-lan': False, 'bind-address': '127.0.0.1', 'mode': 'rule', 'log-level': 'warning', 'tun': {'enable': False}, 'rules': ['MATCH,DIRECT']}))
        os.chmod(config_path, 0o600)
        def api_request(method, path, body=None):
            conn = http.client.HTTPConnection('127.0.0.1', api, timeout=10)
            try:
                conn.request(method, path, body=json.dumps(body) if body else None, headers={'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'})
                response = conn.getresponse(); data = response.read()
                assert response.status in (200, 204), (response.status, data)
                return data
            finally:
                conn.close()
        def transfer(protocol, slow=False):
            conn = http.client.HTTPConnection('127.0.0.1', proxy, timeout=20)
            target = '/stream' if slow else '/'
            if protocol == 'connect':
                conn.set_tunnel('127.0.0.1', origin_port)
            elif protocol == 'socks':
                sock = socket.create_connection(('127.0.0.1', proxy), timeout=20)
                sock.sendall(b'\x05\x01\x00')
                assert recv_exact(sock, 2) == b'\x05\x00'
                sock.sendall(b'\x05\x01\x00\x01' + socket.inet_aton('127.0.0.1') + struct.pack('!H', origin_port))
                reply = recv_exact(sock, 4)
                assert reply[:2] == b'\x05\x00', reply
                length = {1: 4, 4: 16}.get(reply[3])
                if length is None:
                    assert reply[3] == 3
                    length = recv_exact(sock, 1)[0]
                recv_exact(sock, length + 2)
                conn.sock = sock
            else:
                target = f'http://127.0.0.1:{origin_port}{target}'
            try:
                start = time.monotonic()
                conn.request('GET', target)
                response = conn.getresponse()
                assert response.status == 200
                data = response.read()
                assert len(data) == len(PAYLOAD) and hashlib.sha256(data).hexdigest() == EXPECTED
                return len(data) / (time.monotonic() - start) / 1024 / 1024
            finally:
                conn.close()
        def run_once(iteration):
            with open(Path(directory) / 'core.log', 'wb') as log:
                process = subprocess.Popen([core, '-d', directory, '-f', str(config_path)], stdout=log, stderr=log)
                try:
                    for _ in range(100):
                        if process.poll() is not None:
                            raise AssertionError('Core exited before becoming ready')
                        try:
                            api_request('GET', '/version'); break
                        except (OSError, http.client.HTTPException):
                            time.sleep(0.1)
                    else:
                        raise AssertionError('Core readiness timed out')
                    rates = {kind: round(transfer(kind), 2) for kind in ('http', 'connect', 'socks')}
                    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                        tasks = [pool.submit(transfer, kind, True) for kind in ('http', 'connect', 'socks', 'connect')]
                        for _ in range(4):
                            time.sleep(0.08)
                            api_request('PUT', '/configs', {'path': str(config_path)})
                        for task in tasks:
                            task.result()
                    assert process.poll() is None
                    print(json.dumps({'iteration': iteration, 'verified_transfers': 7, 'reloads_during_transfer': 4, 'loopback_MiB_per_s': rates}), flush=True)
                finally:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill(); process.wait()
        try:
            run_once(1)
            run_once(2)  # Same ports must be reusable after shutdown.
        finally:
            origin.shutdown(); origin.server_close()
    print('PASS: HTTP / CONNECT / SOCKS5, 14 intact transfers, 8 live reloads, restart and cleanup')

if __name__ == '__main__':
    main()
