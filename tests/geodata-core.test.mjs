import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import YAML from 'yaml';
import { Store } from '../electron/store.mjs';
import { Core } from '../electron/core.mjs';

test('real core validates GEOIP/GEOSITE/ASN with bundled data in both modes and no network downloads', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'desk-geodata-core-'));
  const store = await new Store(directory).init();
  let downloads = 0;
  const source = http.createServer((req, res) => { downloads++; res.statusCode = 503; res.end('offline'); });
  await new Promise(r => source.listen(0, '127.0.0.1', r));
  const platform = { darwin: 'mac', win32: 'win', linux: 'linux' }[process.platform];
  const core = new Core({ binary: path.resolve(`resources/core/${platform}-${process.arch}/mihomo${process.platform === 'win32' ? '.exe' : ''}`), directory, store });
  t.after(async () => { await core.stop(); source.closeAllConnections(); await new Promise(r => source.close(r)); await rm(directory, { recursive: true, force: true }); });
  const config = { proxies: [], rules: ['GEOSITE,cn,DIRECT', 'GEOIP,CN,DIRECT', 'IP-ASN,4134,DIRECT', 'MATCH,DIRECT'] };
  const start = Date.now();
  for (const mode of [false, true]) {
    await core.validate(YAML.stringify({ ...config, 'geodata-mode': mode }));
    await access(path.join(directory, mode ? 'geoip.dat' : 'geoip.metadb'));
  }
  await access(path.join(directory, 'geosite.dat')); await access(path.join(directory, 'ASN.mmdb'));
  const unavailable = `http://127.0.0.1:${source.address().port}/database`;
  await core.validate(YAML.stringify({ ...config, 'geox-url': { mmdb: unavailable, geoip: unavailable, geosite: unavailable, asn: unavailable } }));
  assert.equal(downloads, 0, 'existing local data must remove the startup network dependency');
  assert.ok(Date.now() - start < 10000);
  assert.ok(core.logs.some(l => l.message.includes('无需联网下载')));
});
