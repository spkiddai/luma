import { useEffect, useState } from 'react';
import { ExternalLink, FolderOpen, Globe2, Network, Power, Settings2 } from 'lucide-react';
import type { AppState, LumaAPI } from './types';

type Props = { state: AppState; busy: string; run: (label: string, task: (api: LumaAPI) => Promise<unknown>) => Promise<void>; notify: (message: string) => void };
function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: () => void }) {
  return <button className={`switch ${checked ? 'on' : ''}`} role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={onChange}><span/></button>;
}

export function Settings({ state, busy, run, notify }: Props) {
  const [port, setPort] = useState(String(state.port));
  useEffect(() => { setPort(String(state.port)); }, [state.port]);
  const disabled = !!busy || state.starting;
  const save = (label: string, data: Parameters<LumaAPI['settings']>[0]) => { void run(label, async api => { const result = await api.settings(data); notify('设置已保存'); return result; }); };
  return <div className="settings-stack settings-grid">
    <section className="card" aria-labelledby="network-settings-title"><div className="card-title"><h3 id="network-settings-title"><Network size={17}/>网络设置</h3></div>
      <div className="setting-row"><div className="setting-copy"><strong>允许局域网连接</strong><span>同一局域网的设备可使用 Luma 的代理端口</span></div><Toggle label="允许局域网连接" checked={state.allowLan} disabled={disabled} onChange={() => save('保存局域网设置', { allowLan: !state.allowLan })}/></div>
      <div className="setting-row"><div className="setting-copy"><strong>代理端口</strong><span>HTTP 与 SOCKS5 共用此端口，保存后立即生效</span></div><form className="port-form" onSubmit={event => { event.preventDefault(); save('保存代理端口', { port: Number(port) }); }}><input type="number" min="1024" max="65535" required aria-label="代理端口" value={port} disabled={disabled} onChange={event => setPort(event.target.value)}/><button className="button small" disabled={disabled || Number(port) === state.port}>保存</button></form></div>
      {state.allowLan && <div className="settings-network-addresses"><span>局域网代理地址</span>{state.lanAddresses.length ? state.lanAddresses.map(address => <code key={address}>{address}:{state.port}</code>) : <span>连接 Wi-Fi 或有线网络后显示地址</span>}</div>}
    </section>
    <section className="card" aria-labelledby="startup-settings-title"><div className="card-title"><h3 id="startup-settings-title"><Power size={17}/>启动设置</h3></div>
      <div className="setting-row"><div className="setting-copy"><strong>自动启动内核</strong><span>打开 Luma 时运行当前配置，默认开启</span></div><Toggle label="自动启动内核" checked={state.autoStart} disabled={disabled} onChange={() => save('保存内核启动设置', { autoStart: !state.autoStart })}/></div>
      <div className="setting-row"><div className="setting-copy"><strong>自动启动 Luma</strong><span>登录电脑时自动打开 Luma</span></div><Toggle label="自动启动 Luma" checked={state.launchAtLogin} disabled={disabled} onChange={() => save('保存 Luma 启动设置', { launchAtLogin: !state.launchAtLogin })}/></div>
    </section>
    <section className="card settings-proxy-card" aria-labelledby="proxy-settings-title"><div className="card-title"><h3 id="proxy-settings-title"><Globe2 size={17}/>代理设置</h3></div>
      <div className="setting-row"><div className="setting-copy"><strong>系统代理</strong><span>支持系统代理的应用使用 Luma；退出时恢复之前的设置</span></div><Toggle label="系统代理" checked={state.systemProxy} disabled={disabled || !state.running} onChange={() => { void run('设置系统代理', api => api.setSystemProxy({ enabled: !state.systemProxy })); }}/></div>
    </section>
    <section className="card settings-data-card" aria-labelledby="data-settings-title"><div className="card-title"><h3 id="data-settings-title"><FolderOpen size={17}/>数据目录</h3></div>
      <div className="setting-row"><div className="setting-copy"><strong>本地配置目录</strong><span className="settings-path">{state.profilesDirectory}</span></div><button className="button small" disabled={!!busy} aria-label="打开本地配置目录" onClick={() => { void run('打开本地配置目录', api => api.openDirectory({ kind: 'profiles' })); }}><FolderOpen size={14}/>打开</button></div>
      <div className="setting-row"><div className="setting-copy"><strong>本地应用目录</strong><span className="settings-path">{state.dataDirectory}</span></div><button className="button small" disabled={!!busy} aria-label="打开本地应用目录" onClick={() => { void run('打开本地应用目录', api => api.openDirectory({ kind: 'data' })); }}><FolderOpen size={14}/>打开</button></div>
    </section>
    <section className="card about-card settings-about"><div className="brand-mark"><Settings2 size={24}/></div><div><h3>Luma <span>v{state.appVersion}</span></h3><p>内核 {state.coreVersion || '未安装'} · GPL-3.0</p></div><button className="icon-button" aria-label="打开 mihomo 文档" onClick={() => { void run('打开文档', api => api.openDocs()); }}><ExternalLink size={17}/></button></section>
  </div>;
}
