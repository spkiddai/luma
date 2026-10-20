import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_PROFILE, parseConfig } from './config.mjs';

export async function atomicWrite(file, data) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, data, { mode: 0o600 });
  await rename(temp, file);
}

export class Store {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'settings.json'); }
  async init() {
    await mkdir(path.join(this.directory, 'profiles'), { recursive: true, mode: 0o700 });
    try { this.state = JSON.parse(await readFile(this.file, 'utf8')); }
    catch (e) {
      if (e.code !== 'ENOENT') throw new Error('本地设置无法读取。请备份后修复 settings.json');
      const id = randomUUID();
      this.state = { version: 3, port: 17890, mode: 'rule', allowLan: false, autoStart: true, launchAtLogin: false, lightweightMode: false, selectedProfile: id, profiles: [{ id, name: '本地直连', kind: 'local', updatedAt: new Date().toISOString() }] };
      await atomicWrite(this.profilePath(id), DEFAULT_PROFILE);
      await this.save();
    }
    if ((this.state.version ?? 1) < 3 || this.state.autoStart === undefined || this.state.allowLan === undefined || Object.hasOwn(this.state, 'applicationProxies')) {
      const { applicationProxies, ...preferences } = this.state;
      this.state = { ...preferences, version: 3, autoStart: (this.state.version ?? 1) < 2 ? true : this.state.autoStart ?? true, allowLan: this.state.allowLan ?? false };
      await this.save();
    }
    return this;
  }
  profilePath(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('无效的配置标识');
    return path.join(this.directory, 'profiles', `${id}.yaml`);
  }
  profile(id) {
    const profile = this.state.profiles.find(p => p.id === id);
    if (!profile) throw new Error('配置不存在');
    return profile;
  }
  content(id = this.state.selectedProfile) { this.profile(id); return readFile(this.profilePath(id), 'utf8'); }
  save() { return atomicWrite(this.file, JSON.stringify(this.state, null, 2)); }
  async add({ name, content, url }) {
    parseConfig(content);
    const id = randomUUID();
    const profile = { id, name: String(name || '未命名配置').trim().slice(0, 80), kind: url ? 'remote' : 'local', ...(url ? { url } : {}), updatedAt: new Date().toISOString() };
    await atomicWrite(this.profilePath(id), content);
    this.state.profiles.push(profile);
    await this.save();
    return profile;
  }
  async update(id, content) {
    parseConfig(content);
    const profile = this.profile(id);
    await atomicWrite(this.profilePath(id), content);
    profile.updatedAt = new Date().toISOString();
    await this.save();
  }
  async remove(id) {
    this.profile(id);
    if (this.state.selectedProfile === id) throw new Error('请先切换到其他配置，再删除此配置');
    this.state.profiles = this.state.profiles.filter(p => p.id !== id);
    await this.save();
    await unlink(this.profilePath(id));
  }
  publicState() {
    return { ...this.state, profiles: this.state.profiles.map(({ url, ...p }) => ({ ...p, source: url ? new URL(url).hostname : '本地文件' })) };
  }
}

export async function downloadProfile(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('请输入有效的订阅 URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('订阅地址仅支持 HTTP / HTTPS');
  try {
    const response = await fetch(parsed, { headers: { 'User-Agent': 'clash.meta/Luma' }, signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`订阅服务器返回 HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('订阅超过 8 MB'); }
      chunks.push(Buffer.from(value));
    }
    const content = Buffer.concat(chunks).toString('utf8');
    parseConfig(content);
    return content;
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error('订阅下载超时，请检查网络后重试');
    if (e.message === 'fetch failed') throw new Error('无法连接订阅服务器，请检查地址和网络');
    throw e;
  }
}
