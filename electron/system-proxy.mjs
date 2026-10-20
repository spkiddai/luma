import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './store.mjs';

const execute = promisify(execFile);
export class SystemProxy {
  constructor(directory, { platform = process.platform, run } = {}) {
    this.file = path.join(directory, 'proxy-backup.json'); this.platform = platform;
    this.run = run || (async (cmd, args) => (await execute(cmd, args, { timeout: 10000, windowsHide: true, env: { ...process.env, LC_ALL: 'C' } })).stdout.trim());
    this.enabled = false;
  }
  network(...args) { return this.run('/usr/sbin/networksetup', args); }
  ps(script) { return this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]); }
  async recover() {
    try { this.backup = JSON.parse(await readFile(this.file, 'utf8')); await this.disable(); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  async enable(port) {
    if (this.enabled) return;
    if (this.backup) await this.disable();
    let backup;
    if (this.platform === 'darwin') {
      const names = (await this.network('-listallnetworkservices')).split('\n').slice(1).filter(n => n && !n.startsWith('*'));
      const services = [];
      for (const name of names) {
        const service = { name, proxies: {} };
        for (const kind of ['web', 'secureweb', 'socksfirewall']) {
          const info = await this.network(`-get${kind}proxy`, name);
          const value = key => info.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1] || '';
          if (value('Enabled') === 'Yes' && value('Authenticated Proxy Enabled') === '1') throw new Error('当前网络服务有带认证的代理，请先手动关闭后再启用');
          service.proxies[kind] = { enabled: value('Enabled') === 'Yes', host: value('Server'), port: value('Port') };
        }
        service.pac = /Enabled: Yes/.test(await this.network('-getautoproxyurl', name));
        service.discovery = /: On/i.test(await this.network('-getproxyautodiscovery', name));
        services.push(service);
      }
      if (!services.length) throw new Error('未找到可用网络服务');
      backup = { platform: this.platform, port, services };
    } else if (this.platform === 'win32') {
      const old = await this.ps("$p=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; @{enabled=$p.ProxyEnable;server=$p.ProxyServer}|ConvertTo-Json -Compress");
      backup = { platform: this.platform, port, previous: JSON.parse(old) };
    } else if (this.platform === 'linux') {
      const previous = {};
      for (const [schema, key] of [['org.gnome.system.proxy', 'mode'], ['org.gnome.system.proxy.http', 'host'], ['org.gnome.system.proxy.http', 'port'], ['org.gnome.system.proxy.https', 'host'], ['org.gnome.system.proxy.https', 'port'], ['org.gnome.system.proxy.socks', 'host'], ['org.gnome.system.proxy.socks', 'port']]) previous[`${schema}:${key}`] = await this.run('gsettings', ['get', schema, key]);
      backup = { platform: this.platform, port, previous };
    } else throw new Error('当前系统不支持自动设置代理');
    this.backup = backup;
    await atomicWrite(this.file, JSON.stringify(backup));
    try {
      if (this.platform === 'darwin') {
        for (const service of backup.services) {
          for (const kind of ['web', 'secureweb', 'socksfirewall']) {
            await this.network(`-set${kind}proxy`, service.name, '127.0.0.1', String(port));
            await this.network(`-set${kind}proxystate`, service.name, 'on');
          }
          await this.network('-setautoproxystate', service.name, 'off');
          await this.network('-setproxyautodiscovery', service.name, 'off');
        }
      } else if (this.platform === 'win32') {
        await this.ps(`$p='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; Set-ItemProperty $p ProxyServer '127.0.0.1:${port}'; Set-ItemProperty $p ProxyEnable 1; ${windowsRefresh}`);
      } else {
        for (const kind of ['http', 'https', 'socks']) {
          await this.run('gsettings', ['set', `org.gnome.system.proxy.${kind}`, 'host', '127.0.0.1']);
          await this.run('gsettings', ['set', `org.gnome.system.proxy.${kind}`, 'port', String(port)]);
        }
        await this.run('gsettings', ['set', 'org.gnome.system.proxy', 'mode', 'manual']);
      }
      this.enabled = true;
    } catch (e) {
      try { await this.disable(); } catch (restore) { throw new Error(`代理设置失败且恢复未完成，请重启应用重试：${restore.message}`); }
      throw new Error(`系统代理设置失败：${e.message}`);
    }
  }
  async disable() {
    const backup = this.backup;
    if (!backup) { this.enabled = false; return; }
    if (backup.platform !== this.platform) throw new Error('代理备份与当前系统不匹配');
    if (this.platform === 'darwin') {
      for (const service of backup.services) {
        for (const [kind, old] of Object.entries(service.proxies)) {
          const current = await this.network(`-get${kind}proxy`, service.name);
          // Preserve changes made by another proxy application after we enabled ours.
          if (!current.includes('Server: 127.0.0.1\n') || !new RegExp(`^Port: ${backup.port}$`, 'm').test(current)) continue;
          // networksetup rejects an empty hostname/port 0. A previously
          // unconfigured proxy is restored by disabling it below.
          if (old.host && Number(old.port) > 0) await this.network(`-set${kind}proxy`, service.name, old.host, String(old.port));
          await this.network(`-set${kind}proxystate`, service.name, old.enabled ? 'on' : 'off');
        }
        if (service.pac) await this.network('-setautoproxystate', service.name, 'on');
        if (service.discovery) await this.network('-setproxyautodiscovery', service.name, 'on');
      }
    } else if (this.platform === 'win32') {
      const server = String(backup.previous.server || '').replaceAll("'", "''");
      await this.ps(`$p='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; if((Get-ItemProperty $p).ProxyServer -eq '127.0.0.1:${backup.port}'){Set-ItemProperty $p ProxyServer '${server}'; Set-ItemProperty $p ProxyEnable ${Number(backup.previous.enabled) || 0}; ${windowsRefresh}}`);
    } else {
      for (const [entry, value] of Object.entries(backup.previous)) {
        const [schema, key] = entry.split(':');
        await this.run('gsettings', ['set', schema, key, value]);
      }
    }
    await unlink(this.file).catch(e => { if (e.code !== 'ENOENT') throw e; });
    this.enabled = false; this.backup = null;
  }
}

const windowsRefresh = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class DeskInternet { [DllImport("wininet.dll")] public static extern bool InternetSetOption(IntPtr h,int o,IntPtr b,int l); }'; [DeskInternet]::InternetSetOption([IntPtr]::Zero,39,[IntPtr]::Zero,0)|Out-Null; [DeskInternet]::InternetSetOption([IntPtr]::Zero,37,[IntPtr]::Zero,0)|Out-Null;`;
