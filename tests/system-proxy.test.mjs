import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SystemProxy } from '../electron/system-proxy.mjs';

async function fixture(t, fail = false) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'desk-proxy-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const settings = { web: { host: 'old.example', port: '8080', enabled: true }, secureweb: { host: 'old-secure.example', port: '8443', enabled: false }, socksfirewall: { host: 'old-socks.example', port: '1080', enabled: false }, pac: true, discovery: true };
  let failed = false;
  const run = async (cmd, args) => {
    const [action, service, host, port] = args;
    if (action === '-listallnetworkservices') return 'An asterisk (*) denotes that a network service is disabled.\nWi-Fi';
    if (action === '-getautoproxyurl') return `URL: https://example.com/proxy.pac\nEnabled: ${settings.pac ? 'Yes' : 'No'}`;
    if (action === '-getproxyautodiscovery') return `Auto Proxy Discovery: ${settings.discovery ? 'On' : 'Off'}`;
    if (action === '-setautoproxystate') { settings.pac = host === 'on'; return ''; }
    if (action === '-setproxyautodiscovery') { settings.discovery = host === 'on'; return ''; }
    for (const kind of ['web', 'secureweb', 'socksfirewall']) {
      if (action === `-get${kind}proxy`) return `Enabled: ${settings[kind].enabled ? 'Yes' : 'No'}\nServer: ${settings[kind].host}\nPort: ${settings[kind].port}\nAuthenticated Proxy Enabled: 0`;
      if (action === `-set${kind}proxy`) {
        if (fail && kind === 'secureweb' && !failed) { failed = true; throw new Error('simulated permission error'); }
        settings[kind].host = host; settings[kind].port = port; return '';
      }
      if (action === `-set${kind}proxystate`) { settings[kind].enabled = host === 'on'; return ''; }
    }
    throw new Error(`Unexpected command ${args}`);
  };
  return { directory, settings, run };
}
test('system proxy restores existing HTTP, HTTPS, SOCKS, PAC and autodiscovery settings', async t => {
  const f = await fixture(t); const before = structuredClone(f.settings);
  const proxy = new SystemProxy(f.directory, { platform: 'darwin', run: f.run });
  await proxy.enable(7897); assert.equal(proxy.enabled, true); assert.equal(f.settings.web.host, '127.0.0.1'); assert.equal(f.settings.pac, false);
  await proxy.disable(); assert.equal(proxy.enabled, false); assert.deepEqual(f.settings, before);
});
test('partially failed proxy changes are rolled back', async t => {
  const f = await fixture(t, true); const before = structuredClone(f.settings);
  const proxy = new SystemProxy(f.directory, { platform: 'darwin', run: f.run });
  await assert.rejects(proxy.enable(7897), /设置失败/); assert.deepEqual(f.settings, before);
  await assert.rejects(access(proxy.file));
});
test('persisted proxy settings recover after an application crash', async t => {
  const f = await fixture(t); const before = structuredClone(f.settings);
  await new SystemProxy(f.directory, { platform: 'darwin', run: f.run }).enable(7897);
  await new SystemProxy(f.directory, { platform: 'darwin', run: f.run }).recover();
  assert.deepEqual(f.settings, before);
});
test('restore preserves a proxy endpoint subsequently set by another application', async t => {
  const f = await fixture(t);
  const proxy = new SystemProxy(f.directory, { platform: 'darwin', run: f.run });
  await proxy.enable(7897);
  f.settings.web = { host: 'another.app', port: '9999', enabled: true };
  await proxy.disable(); assert.equal(f.settings.web.host, 'another.app'); assert.equal(f.settings.web.port, '9999');
});
test('previously unconfigured proxies restore to disabled without invalid empty-host commands', async t => {
  const f = await fixture(t);
  f.settings.secureweb = { host: '', port: '0', enabled: false };
  const proxy = new SystemProxy(f.directory, { platform: 'darwin', run: async (cmd, args) => {
    if (args[0] === '-setsecurewebproxy') assert.ok(args[2] && Number(args[3]) > 0);
    return f.run(cmd, args);
  } });
  await proxy.enable(7897); await proxy.disable();
  assert.equal(f.settings.secureweb.enabled, false);
});
