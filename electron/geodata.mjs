import { readFile, readdir, stat, open, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { atomicWrite } from './store.mjs';

const resources = {
  mmdb: { file: 'geoip.metadb', aliases: ['geoip.metadb', 'Country.mmdb', 'geoip.db'] },
  geoip: { file: 'geoip.dat', aliases: ['geoip.dat'] },
  geosite: { file: 'geosite.dat', aliases: ['geosite.dat'] },
  asn: { file: 'ASN.mmdb', aliases: ['ASN.mmdb'] },
};

export function requiredGeodata(config) {
  const result = new Set();
  // Includes logical/sub-rules and DNS policies, not just top-level rules.
  const text = JSON.stringify(config);
  if (/\bGEOIP\b/i.test(text) || (config.dns?.enable && config.dns?.fallback?.length && config.dns?.['fallback-filter']?.geoip !== false)) result.add(config['geodata-mode'] === true ? 'geoip' : 'mmdb');
  if (/\bGEOSITE\b/i.test(text)) result.add('geosite');
  if (/\bIP-ASN\b/i.test(text)) result.add('asn');
  return [...result];
}

async function usable(file, type) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size < 32) return false;
    if (!['mmdb', 'asn'].includes(type)) return true;
    const handle = await open(file, 'r');
    try {
      const tail = Buffer.alloc(Math.min(info.size, 128 * 1024));
      await handle.read(tail, 0, tail.length, info.size - tail.length);
      return tail.includes(Buffer.from([0xab, 0xcd, 0xef, ...Buffer.from('MaxMind.com')]));
    } finally { await handle.close(); }
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function prepareGeodata({ directory, bundledDirectory, config, log = () => {}, repair = [] }) {
  const needed = requiredGeodata(config).filter(type => !config['geox-url']?.[type]);
  if (!needed.length) return;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const files = (await readdir(directory, { withFileTypes: true })).filter(f => !f.isDirectory()).map(f => f.name).sort();
  let manifest;
  for (const type of needed) {
    const resource = resources[type];
    const name = files.find(file => resource.aliases.some(alias => file.toLowerCase() === alias.toLowerCase())) || resource.file;
    const destination = path.join(directory, name);
    if (!repair.includes(type) && await usable(destination, type)) continue;
    if (!manifest) {
      try { manifest = JSON.parse(await readFile(path.join(bundledDirectory, 'manifest.json'), 'utf8')); }
      catch { throw new Error('应用缺少内置地理数据库，请更新应用；开发环境请运行 npm run geodata:download'); }
    }
    const metadata = manifest.files.find(f => f.file === resource.file);
    const data = await readFile(path.join(bundledDirectory, resource.file)).catch(() => { throw new Error(`内置 ${resource.file} 缺失，请重新下载应用包`); });
    if (!metadata || createHash('sha256').update(data).digest('hex') !== metadata.sha256) throw new Error(`内置 ${resource.file} 校验失败，请重新下载应用包`);
    await atomicWrite(destination, data);
    log('info', `已从应用内置资源准备 ${name}，无需联网下载`);
  }
}

export function validationFailure(error, secret = '') {
  const output = `${error.stdout || ''}\n${error.stderr || ''}`.replace(/\x1b\[[0-9;]*m/g, '');
  const timeout = error.killed || error.code === 'ETIMEDOUT';
  if (timeout && /(?:download|下载)/i.test(output) && /(?:MMDB|GeoSite|GeoIP|ASN)/i.test(output)) {
    return '地理数据库下载超时。若配置指定了自定义 geox-url，请检查该地址能否访问；默认数据库请更新应用后重试。';
  }
  if (timeout) return '内核配置校验超时，可能有远程规则或配置资源无法下载。请检查网络和资源地址后重试。';
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  const failures = lines.filter(line => /level=(?:fatal|error)|Parse config error|invalid|can.t download/i.test(line));
  const selected = failures.at(-1) || lines.at(-1) || error.message;
  const message = selected.match(/msg="((?:\\.|[^"\\])*)"/)?.[1] || selected;
  return (secret ? message.replaceAll(secret, '[redacted]') : message).replace(/https?:\/\/[^\s"']+/g, '[远程资源地址]').slice(-1600);
}
