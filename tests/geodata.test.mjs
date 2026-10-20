import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, stat, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { requiredGeodata, prepareGeodata, validationFailure } from '../electron/geodata.mjs';

const bundledDirectory = path.resolve('resources/geodata');
const config = { rules: ['GEOIP,CN,DIRECT', 'MATCH,DIRECT'] };
async function fixture(t) { const directory = await mkdtemp(path.join(os.tmpdir(), 'desk-geodata-')); t.after(() => rm(directory, { recursive: true, force: true })); return directory; }

test('geo dependencies include MMDB/dat modes, DNS policies, fallback and logical rules', () => {
  assert.deepEqual(requiredGeodata(config), ['mmdb']);
  assert.deepEqual(requiredGeodata({ ...config, 'geodata-mode': true }), ['geoip']);
  assert.deepEqual(requiredGeodata({ rules: ['AND,((GEOSITE,cn),(IP-ASN,4134)),DIRECT'] }), ['geosite', 'asn']);
  assert.ok(requiredGeodata({ dns: { enable: true, fallback: ['https://example.com'], 'fallback-filter': { geoip: true } } }).includes('mmdb'));
  assert.ok(requiredGeodata({ dns: { 'nameserver-policy': { 'geosite:cn': '223.5.5.5' } } }).includes('geosite'));
  assert.deepEqual(requiredGeodata({ rules: ['MATCH,DIRECT'] }), []);
});
test('missing/corrupt MMDB is seeded atomically and valid existing data is preserved', async t => {
  const directory = await fixture(t); const file = path.join(directory, 'Country.mmdb');
  await writeFile(file, 'interrupted download');
  await prepareGeodata({ directory, bundledDirectory, config });
  assert.deepEqual(await readFile(file), await readFile(path.join(bundledDirectory, 'geoip.metadb')));
  const before = (await stat(file)).mtimeMs;
  await prepareGeodata({ directory, bundledDirectory, config });
  assert.equal((await stat(file)).mtimeMs, before);
  await assert.rejects(access(path.join(directory, 'geoip.metadb')), 'must reuse existing filename aliases');
});
test('custom geox sources are not replaced with bundled databases', async t => {
  const directory = await fixture(t);
  await prepareGeodata({ directory, bundledDirectory: '/missing-bundle', config: { ...config, 'geox-url': { mmdb: 'https://custom.example/db' } } });
  await assert.rejects(access(path.join(directory, 'geoip.metadb')));
});
test('bundle checksum failure never installs unverified bytes', async t => {
  const directory = await fixture(t); const bundle = await fixture(t);
  await writeFile(path.join(bundle, 'manifest.json'), JSON.stringify({ files: [{ file: 'geoip.metadb', sha256: 'incorrect' }] }));
  await writeFile(path.join(bundle, 'geoip.metadb'), 'invalid');
  await assert.rejects(prepareGeodata({ directory, bundledDirectory: bundle, config }), /校验失败/);
  await assert.rejects(access(path.join(directory, 'geoip.metadb')));
});
test('validation reports a download timeout or stderr cause, with secrets redacted', () => {
  assert.match(validationFailure({ killed: true, stdout: 'level=info msg="Can\'t find MMDB, start download"' }), /数据库下载超时/);
  assert.match(validationFailure({ killed: true, stdout: 'Start initial configuration' }), /配置校验超时/);
  const message = validationFailure({ stdout: 'level=info msg="Start initial configuration"', stderr: 'level=error msg="Parse config error: unsupported proxy secret-123 https://example.com/?token=private"' }, 'secret-123');
  assert.match(message, /unsupported proxy/); assert.ok(!message.includes('secret-123')); assert.ok(!message.includes('token=private')); assert.ok(!message.includes('Start initial'));
});
