"""Run the actual macOS application on a disposable GitHub runner with synthetic data.
Never runs on the user's computer or reads a real subscription.
"""
import http.client
import http.server
import json
import os
import re
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import threading
import time

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'This test is cloud-runner only'
assert sys.platform == 'darwin'
bundle = Path(sys.argv[1]).resolve()
legacy = Path.home() / 'Library/Application Support/Mihomo Desk'
native = Path.home() / 'Library/Application Support/io.github.spkiddai.luma'
installed = Path('/Applications/Luma-CI.app')
assert not legacy.exists() and not native.exists() and not installed.exists(), 'Refusing existing user/application data'
output = Path('artifacts/native-smoke'); output.mkdir(parents=True, exist_ok=True)

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); return sock.getsockname()[1]
proxy_port = free_port()

class Origin(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        payload = b'Luma native forwarding fixture'
        self.send_response(200); self.send_header('Content-Length', str(len(payload)))
        self.end_headers(); self.wfile.write(payload)
    def log_message(self, *_): pass
origin = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Origin)
threading.Thread(target=origin.serve_forever, daemon=True).start()

class UnixHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(str(Path(subprocess.check_output(['getconf','DARWIN_USER_TEMP_DIR'], text=True).strip()) / 'luma-mihomo.sock'))

def api(method, path, body=None):
    conn = UnixHTTP('localhost', timeout=5)
    try:
        conn.request(method, path, json.dumps(body) if body is not None else None, {'Content-Type':'application/json', 'Authorization':'Bearer set-your-secret'})
        response = conn.getresponse(); data = response.read()
        assert response.status in (200, 204), (response.status, data)
        return json.loads(data) if data else None
    finally: conn.close()

def access(expected=True):
    result = subprocess.run(['curl','--silent','--show-error','--max-time','5','--proxy',f'http://127.0.0.1:{proxy_port}','--noproxy','',f'http://origin.luma.test:{origin.server_port}/'],capture_output=True)
    success = result.returncode == 0 and result.stdout == b'Luma native forwarding fixture'
    assert success == expected, f'Forwarding result {success}, expected {expected}'

def core_processes():
    result = subprocess.run(['pgrep','-x','luma-mihomo'],capture_output=True,text=True)
    return result.stdout.split()

def capture_window(pid, name):
    # Capture only this synthetic app window, excluding unrelated runner dialogs.
    source = output/'window-id.swift'
    source.write_text('''import CoreGraphics
let pid = Int(CommandLine.arguments[1])!
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
for window in windows {
    guard window[kCGWindowOwnerPID as String] as? Int == pid,
          let bounds = window[kCGWindowBounds as String] as? [String: Any],
          (bounds["Width"] as? Double ?? 0) > 400,
          let id = window[kCGWindowNumber as String] as? Int else { continue }
    print(id)
    break
}
''')
    result = subprocess.run(['swift',str(source),str(pid)],capture_output=True,text=True,timeout=60)
    window_id = result.stdout.strip()
    if result.returncode == 0 and window_id.isdigit():
        subprocess.run(['screencapture','-x','-o','-l',window_id,str(output/f'{name}.png')],check=False)
    else:
        subprocess.run(['screencapture','-x',str(output/f'{name}.png')],check=False)

legacy.joinpath('profiles').mkdir(parents=True, mode=0o700)
legacy.joinpath('settings.json').write_text(json.dumps({'version':3,'port':proxy_port,'mode':'rule','allowLan':False,'autoStart':True,'selectedProfile':'fixture','profiles':[{'id':'fixture','name':'CI fixture','kind':'local'}]}))
legacy.joinpath('profiles/fixture.yaml').write_text(json.dumps({'hosts':{'origin.luma.test':'127.0.0.1'}, 'proxies':[], 'proxy-groups':[{'name':'Fixture','type':'select','proxies':['DIRECT','REJECT']}], 'rules':['MATCH,Fixture']}))
source_before = legacy.joinpath('profiles/fixture.yaml').read_bytes()
subprocess.run(['sudo','ditto',str(bundle),str(installed)],check=True)
try:
    for iteration, page, theme, language, screenshot in [
        (1, '/', 'light', 'en', 'overview-en'),
        (2, '/', 'light', 'zh', 'overview-zh'),
        (3, '/proxies', 'dark', 'zh', 'proxies-dark'),
        (4, '/settings', 'light', 'zh', 'settings-zh'),
    ]:
        if iteration > 1:
            preferences = native / 'verge.yaml'
            saved = preferences.read_text()
            for key, value in {'start_page': page, 'theme_mode': theme, 'language': language}.items():
                saved, count = re.subn(rf'^{key}:.*$', f'{key}: {json.dumps(value)}', saved, flags=re.M)
                if not count: saved += f'\n{key}: {json.dumps(value)}\n'
            preferences.write_text(saved)
        with (output / f'app-{iteration}.log').open('wb') as log:
            process = subprocess.Popen([str(installed/'Contents/MacOS/luma')],stdout=log,stderr=log)
            try:
                for _ in range(180):
                    assert process.poll() is None, 'Native application exited during startup'
                    try:
                        api('GET','/version'); access(); break
                    except (OSError, http.client.HTTPException, AssertionError): time.sleep(0.5)
                else: raise AssertionError('App never became ready for proxy forwarding')
                assert len(core_processes()) == 1, 'Expected exactly one managed core'
                assert native.joinpath('profiles/fixture.yaml').read_bytes() == source_before
                assert legacy.joinpath('profiles/fixture.yaml').read_bytes() == source_before
                config = api('GET','/configs')
                assert config['mixed-port'] == proxy_port
                assert not config.get('tun',{}).get('enable',False)
                for _ in range(5):
                    api('PUT','/proxies/Fixture',{'name':'REJECT'}); access(False)
                    api('PUT','/proxies/Fixture',{'name':'DIRECT'}); access()
                    api('PUT','/configs',{'path':str(native/'clash-verge.yaml')}); access()
                flags = subprocess.check_output(['scutil','--proxy'],text=True)
                for key in ['HTTPEnable','HTTPSEnable','SOCKSEnable','ProxyAutoConfigEnable']:
                    assert f'{key} : 1' not in flags, 'System proxy must remain disabled'
                # Forwarding becomes ready before the webview finishes rendering.
                time.sleep(10)
                capture_window(process.pid, screenshot)
                print(json.dumps({'iteration':iteration,'core_count':len(core_processes()),'switches':10,'reloads':5,'migration':'preserved','system_proxy':'off'}),flush=True)
            finally:
                process.terminate()
                try: process.wait(timeout=20)
                except subprocess.TimeoutExpired: process.kill(); process.wait(); raise AssertionError('App did not quit cleanly')
                assert process.returncode == 0, f'Application cleanup failed: exit {process.returncode}'
                for _ in range(100):
                    if not core_processes(): break
                    time.sleep(0.1)
                assert not core_processes(), 'Managed core leaked after app exit'
    print('PASS: native app auto-start, migration, selection, hot reload, quit and restart')
finally:
    origin.shutdown(); origin.server_close()
    subprocess.run(['sudo','rm','-rf',str(installed)],check=True)
    if native.exists():
        # This contains only the synthetic fixture. Preserve diagnostics for failed CI.
        logs = native/'logs'
        if logs.exists(): shutil.copytree(logs,output/'logs',dirs_exist_ok=True)
