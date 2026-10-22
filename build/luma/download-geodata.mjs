import { mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildDownload } from './build-download.mjs';

const request = url => buildDownload(url, 80 * 1024 * 1024);
const release = JSON.parse((await request('https://api.github.com/repos/MetaCubeX/meta-rules-dat/releases/tags/latest')).toString());
const names = { 'geoip.metadb': 'geoip.metadb', 'geoip.dat': 'geoip.dat', 'geosite.dat': 'geosite.dat', 'GeoLite2-ASN.mmdb': 'ASN.mmdb' };
await mkdir('resources/geodata', { recursive: true });
const results = await Promise.allSettled(Object.entries(names).map(async ([name, file]) => {
  const asset = release.assets.find(a => a.name === name);
  if (!asset?.digest?.startsWith('sha256:')) throw new Error(`Missing release asset or digest: ${name}`);
  console.log(`Downloading ${name}`);
  const data = await request(asset.browser_download_url);
  const sha256 = createHash('sha256').update(data).digest('hex');
  if (asset.digest !== `sha256:${sha256}`) throw new Error(`SHA-256 verification failed: ${name}`);
  await writeFile(`resources/geodata/${file}.tmp`, data);
  await rename(`resources/geodata/${file}.tmp`, `resources/geodata/${file}`);
  console.log(`Verified ${name} (${data.length} bytes)`);
  return { file, asset: name, sha256, bytes: data.length, url: asset.browser_download_url };
}));
const failures = results.filter(r => r.status === 'rejected');
if (failures.length) throw new AggregateError(failures.map(r => r.reason), 'Geodata download failed');
await writeFile('resources/geodata/manifest.json', JSON.stringify({ source: 'https://github.com/MetaCubeX/meta-rules-dat', publishedAt: release.published_at, files: results.map(r => r.value) }, null, 2));
await mkdir('resources/licenses', { recursive: true });
const license = JSON.parse((await request('https://api.github.com/repos/MetaCubeX/meta-rules-dat/contents/LICENSE?ref=master')).toString());
if (license.encoding !== 'base64') throw new Error('Unexpected license encoding');
await writeFile('resources/licenses/meta-rules-dat-LICENSE', Buffer.from(license.content, 'base64'));
console.log('Geodata is ready for offline validation and packaging.');
