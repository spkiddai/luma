import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { access, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './store.mjs';
import { normalizeConfig, parseConfig } from './config.mjs';
import { prepareGeodata, validationFailure } from './geodata.mjs';

const exec = promisify(execFile);
export async function availablePort(port = 0) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', () => reject(new Error(`端口 ${port} 已被占用，请在设置中修改混合端口`)));
    server.listen(port, '127.0.0.1', () => { const result = server.address().port; server.close(() => resolve(result)); });
  });
}

export class Core {
  constructor({ binary, directory, store, onExit = () => {}, geodataDirectory = path.resolve(path.dirname(binary), '../../geodata') }) {
    Object.assign(this, { binary, directory, store, onExit, geodataDirectory });
    this.logs = []; this.running = false; this.lastSample = null; this.version = null;
    this.memory = 0; this.traffic = { up: 0, down: 0 };
    this.secret = randomBytes(32).toString('hex');
  }
  log(level, message) {
    this.logs.push({ time: new Date().toISOString(), level, message: message.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 4000) });
    if (this.logs.length > 500) this.logs.splice(0, this.logs.length - 500);
  }
  async detect() {
    try {
      await access(this.binary);
      const { stdout } = await exec(this.binary, ['-v'], { timeout: 5000 });
      this.version = stdout.match(/Mihomo\s+([^\s]+)/i)?.[1] || stdout.trim().slice(0, 80);
      return true;
    } catch { return false; }
  }
  async runtimeContent(content) {
    if (!this.controllerPort) this.controllerPort = await availablePort();
    return normalizeConfig(content, { port: this.store.state.port, mode: this.store.state.mode, allowLan: this.store.state.allowLan, controllerPort: this.controllerPort, secret: this.secret });
  }
  async validate(content) {
    const config = parseConfig(content);
    const normalized = await this.runtimeContent(content);
    const prepare = repair => prepareGeodata({ directory: this.directory, bundledDirectory: this.geodataDirectory, config, repair, log: (level, message) => this.log(level, message) });
    await prepare();
    const candidate = path.join(this.directory, 'candidate.yaml');
    await atomicWrite(candidate, normalized);
    const validate = () => exec(this.binary, ['-t', '-d', this.directory, '-f', candidate], { timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
    try { await validate(); }
    catch (e) {
      // A truncated .dat from an earlier failed download can still be non-empty.
      const output = `${e.stdout || ''}\n${e.stderr || ''}`;
      const repair = [];
      if (/GeoSite\.dat invalid/i.test(output)) repair.push('geosite');
      if (/GeoIP\.dat invalid/i.test(output)) repair.push('geoip');
      if (/MMDB invalid|Can't load MMDB/i.test(output)) repair.push('mmdb');
      if (/ASN invalid|Can't load ASN/i.test(output)) repair.push('asn');
      if (repair.length && repair.every(type => !config['geox-url']?.[type])) {
        await prepare(repair);
        try { await validate(); return normalized; }
        catch (retry) { e = retry; }
      }
      const details = validationFailure(e, this.secret);
      this.log('error', details);
      throw new Error(`内核配置校验失败：${details}`);
    }
    return normalized;
  }
  async start() {
    if (this.running) return;
    if (!await this.detect()) throw new Error('未找到 mihomo 内核，请先运行 npm run core:download');
    await availablePort(this.store.state.port);
    this.controllerPort = await availablePort();
    const content = await this.validate(await this.store.content());
    this.groupOrder = (parseConfig(content)['proxy-groups'] || []).map(group => group.name);
    this.runtime = path.join(this.directory, 'runtime.yaml');
    await atomicWrite(this.runtime, content);
    // The controller starts before forwarding is ready. The core's post-up hook
    // runs after its tunnel enters Running. Keep the command constant and pass
    // the private marker path through an environment variable, never shell text.
    const markerFile = path.join(this.directory, `.startup-ready-${randomBytes(16).toString('hex')}`);
    const readyCommand = process.platform === 'win32' ? 'echo ready>"%LUMA_READY_FILE%"' : 'printf ready > "$LUMA_READY_FILE"';
    const child = spawn(this.binary, ['-d', this.directory, '-f', this.runtime, '-post-up', readyCommand], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, LUMA_READY_FILE: markerFile } });
    this.child = child;
    this.lastSample = null;
    let exitError;
    for (const stream of [child.stdout, child.stderr]) {
      let buffer = '';
      stream.setEncoding('utf8');
      stream.on('data', chunk => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/); buffer = lines.pop();
        for (const line of lines) if (line.trim()) this.log(/level=error|fatal/i.test(line) ? 'error' : /level=warn/i.test(line) ? 'warning' : 'info', line);
      });
    }
    child.once('error', e => { exitError = e.message; });
    child.once('exit', code => {
      if (this.child !== child) return;
      this.running = false; this.child = null;
      this.streamAbort?.abort();
      this.log(code ? 'error' : 'info', `内核已退出（${code ?? 'signal'}）`);
      if (this.stoppingChild !== child) Promise.resolve(this.onExit()).catch(e => this.log('error', e.message));
    });
    try {
    for (let i = 0; i < 800; i++) {
      if (exitError || child.exitCode !== null || child.signalCode) break;
      try {
        if ((await readFile(markerFile, 'utf8')).trim() !== 'ready') throw new Error('Forwarding is not ready');
        const version = await this.request('/version', {}, true);
        this.version = version.version;
        this.running = true; this.startedAt = Date.now();
        this.memory = 0; this.traffic = { up: 0, down: 0 }; this.connectionSummary = null;
        this.streamAbort = new AbortController();
        void this.stream('/traffic', data => { this.traffic = data; }, this.streamAbort.signal);
        void this.stream('/memory', data => { if (data.inuse > 0) this.memory = data.inuse; }, this.streamAbort.signal);
        this.log('info', `Mihomo ${this.version} 已启动，混合端口 ${this.store.state.port}`);
        return;
      } catch { await new Promise(r => setTimeout(r, 150)); }
    }
    await this.stop();
    throw new Error(`内核启动失败：${exitError || this.logs.at(-2)?.message || '控制接口未就绪'}`);
    } finally { await unlink(markerFile).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async request(endpoint, options = {}, starting = false) {
    if (!starting && !this.running) throw new Error('请先启动内核');
    const response = await fetch(`http://127.0.0.1:${this.controllerPort}${endpoint}`, {
      ...options, headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(endpoint.includes('/delay') ? 10000 : 5000),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || `内核接口错误 HTTP ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  }
  async apply(content) {
    const normalized = await this.validate(content);
    if (this.running) await this.request('/configs?force=true', { method: 'PUT', body: JSON.stringify({ payload: normalized }) });
    if (this.runtime) await atomicWrite(this.runtime, normalized);
    this.groupOrder = (parseConfig(normalized)['proxy-groups'] || []).map(group => group.name);
  }
  async proxies() {
    if (!this.running) return {};
    const { proxies } = await this.request('/proxies');
    // The controller returns an alphabetized map; retain the subscription's group order.
    const names = [...new Set([...(this.groupOrder || []), ...Object.keys(proxies)])];
    return Object.fromEntries(names.filter(name => Object.hasOwn(proxies, name)).map(name => [name, proxies[name]]));
  }
  async stream(endpoint, consume, signal) {
    while (!signal.aborted) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.controllerPort}${endpoint}`, { headers: { Authorization: `Bearer ${this.secret}` }, signal });
        if (!response.ok || !response.body) throw new Error('Stream unavailable');
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (!signal.aborted) {
          const { value, done } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n'); buffer = lines.pop();
          for (const line of lines) if (line.trim()) consume(JSON.parse(line));
        }
      } catch { if (signal.aborted) return; }
      if (!signal.aborted) await new Promise(r => setTimeout(r, 1000));
    }
  }
  async snapshot({ includeConnections = true } = {}) {
    if (!this.running) return { upload: 0, download: 0, uploadTotal: 0, downloadTotal: 0, memory: 0, connectionCount: 0, connections: [], uptime: 0 };
    let connections = [];
    // Only the connections page needs the full table. Keep summaries briefly so
    // the overview does not repeatedly serialize every active connection.
    if (includeConnections || !this.connectionSummary || Date.now() - this.connectionSummary.sampledAt >= 2500) {
      const data = await this.request('/connections');
      connections = data.connections || [];
      this.connectionSummary = { uploadTotal: data.uploadTotal || 0, downloadTotal: data.downloadTotal || 0, memory: data.memory || 0, connectionCount: connections.length, sampledAt: Date.now() };
    }
    const { sampledAt, ...summary } = this.connectionSummary;
    return { ...summary, upload: this.traffic.up || 0, download: this.traffic.down || 0, memory: this.memory || summary.memory, connections: includeConnections ? connections : [], uptime: Math.floor((Date.now() - this.startedAt) / 1000) };
  }
  async stop() {
    const child = this.child;
    this.running = false;
    this.streamAbort?.abort();
    if (!child) return;
    this.stoppingChild = child;
    await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      if (child.exitCode !== null || child.signalCode) { clearTimeout(timer); resolve(); } else child.kill('SIGTERM');
    });
    if (this.child === child) this.child = null;
    this.stoppingChild = null;
  }
}
