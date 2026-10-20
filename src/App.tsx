import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, ArrowDown, ArrowDownLeft, ArrowRight, ArrowUp, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Command, Copy, Download, ExternalLink, FileCode2, FilePlus2, FolderOpen, Gauge, Globe2, HardDrive, Layers3, Link2, LoaderCircle, Minus, Network, Play, Plus, Power, Radio, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Square, Terminal, Trash2, Upload, Waypoints, X, Zap } from 'lucide-react';
import { ProxyGroups } from './ProxyGroups';
import { Settings } from './Settings';
import type { AppState, LumaAPI, Log, Profile, ProxyNode, Rule, Stats } from './types';

const navigation = [
  { id: 'overview', label: '概览', icon: Gauge }, { id: 'proxies', label: '代理', icon: Globe2 },
  { id: 'profiles', label: '配置', icon: Layers3 }, { id: 'connections', label: '连接', icon: Waypoints },
  { id: 'rules', label: '规则', icon: ShieldCheck }, { id: 'logs', label: '日志', icon: Terminal },
  { id: 'settings', label: '设置', icon: Settings2 },
] as const;
type Page = typeof navigation[number]['id'];
type Icon = typeof Gauge;
const emptyStats: Stats = { upload: 0, download: 0, uploadTotal: 0, downloadTotal: 0, memory: 0, connectionCount: 0, connections: [], uptime: 0 };
type TrafficSample = Pick<Stats, 'upload' | 'download'>;
const modeLabels = { rule: '规则', global: '全局', direct: '直连' };
function bytes(value: number, speed = false) {
  const unit = value >= 1048576 ? 'MB' : value >= 1024 ? 'KB' : 'B';
  return { value: (value / (unit === 'MB' ? 1048576 : unit === 'KB' ? 1024 : 1)).toFixed(unit === 'B' ? 0 : 1), unit: unit + (speed ? '/s' : '') };
}
function size(value: number) { const b = bytes(value); return `${b.value} ${b.unit}`; }
function uptime(value: number) { return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function Toggle({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return <button type="button" className={`switch ${checked ? 'on' : ''}`} role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={onChange}><span /></button>;
}
function Empty({ icon: Icon = Radio, title, text, action }: { icon?: Icon; title: string; text: string; action?: ReactNode }) {
  return <div className="empty"><div className="empty-icon"><Icon size={25} strokeWidth={1.5} /></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}
function CardTitle({ icon: Icon, title, action }: { icon: Icon; title: string; action?: ReactNode }) { return <div className="card-title"><h3><Icon size={17} />{title}</h3>{action}</div>; }
function Chart({ history }: { history: TrafficSample[] }) {
  const points = [...Array(Math.max(0, 45 - history.length)).fill(emptyStats), ...history].slice(-45);
  const max = Math.max(1024, ...points.flatMap(p => [p.download, p.upload]));
  const line = (key: 'upload' | 'download') => points.map((p, i) => `${i * 700 / 44},${151 - p[key] / max * 122}`).join(' ');
  return <div className="chart"><div className="chart-y"><span>{size(max)}/s</span><span>{size(max / 2)}/s</span><span>0 B/s</span></div><div className="chart-plot"><svg viewBox="0 0 700 160" preserveAspectRatio="none" role="img" aria-label="最近 45 次采样的上传和下载速度"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#52ad83" stopOpacity=".18"/><stop offset="100%" stopColor="#52ad83" stopOpacity="0"/></linearGradient></defs>{[29, 90, 151].map(y => <line key={y} x1="0" x2="700" y1={y} y2={y} stroke="#e8eeea" strokeDasharray="3 5"/>)}<polygon points={`0,160 ${line('download')} 700,160`} fill="url(#chart-fill)"/><polyline points={line('download')} fill="none" stroke="#34966d" strokeWidth="2.3" vectorEffect="non-scaling-stroke"/><polyline points={line('upload')} fill="none" stroke="#9bb7d4" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></svg><div className="chart-x"><span>约 1 分钟前</span><span>30 秒前</span><span>现在</span></div></div></div>;
}

export default function App() {
  const api = window.luma;
  const [state, setState] = useState<AppState>();
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [history, setHistory] = useState<TrafficSample[]>([]);
  const [page, setPage] = useState<Page>('overview');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [proxies, setProxies] = useState<Record<string, ProxyNode>>({});
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [query, setQuery] = useState('');
  const [logLevel, setLogLevel] = useState('all');
  const [modal, setModal] = useState<'import' | 'edit' | null>(null);
  const [importTab, setImportTab] = useState<'url' | 'yaml'>('url');
  const [name, setName] = useState(''); const [source, setSource] = useState('');
  const [editing, setEditing] = useState<Profile>();
  const [delays, setDelays] = useState<Record<string, number | 'timeout'>>({});
  const busyRef = useRef(false);
  useEffect(() => {
    if (!api) return;
    const navigate = (destination: { page: string; importProfile?: boolean }) => {
      if (navigation.some(p => p.id === destination.page)) { setPage(destination.page as Page); setError(''); }
      if (destination.importProfile) { setName(''); setSource(''); setImportTab('url'); setModal('import'); }
    };
    navigate(api.initialNavigation);
    return api.onNavigate(navigate);
  }, [api]);
  const load = useCallback(async () => {
    if (!api || busyRef.current || document.hidden) return;
    const [nextState, nextStats] = await Promise.all([api.state(), api.stats({ includeConnections: page === 'connections' })]);
    if (!busyRef.current) {
      setState(nextState); setStats(nextStats);
      if (page === 'overview') setHistory(h => [...h, { upload: nextStats.upload, download: nextStats.download }].slice(-45));
    }
  }, [api, page]);
  useEffect(() => {
    load().catch(e => setError(e.message));
    const onVisibility = () => { if (!document.hidden) void load().catch(e => setError(e.message)); };
    document.addEventListener('visibilitychange', onVisibility);
    let loading = false;
    const timer = setInterval(async () => { if (loading) return; loading = true; try { await load(); } catch (e) { setError((e as Error).message); } finally { loading = false; } }, 1500);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [load]);
  useEffect(() => {
    if (!api) return;
    let canceled = false;
    const refresh = async () => {
      if (busyRef.current || document.hidden) return;
      try {
        if (page === 'proxies') { const result = await api.proxies(); if (!canceled) { setProxies(result); setDelays({}); } }
        if (page === 'rules') { const result = await api.rules(); if (!canceled) setRules(result); }
        if (page === 'logs') { const result = await api.logs(); if (!canceled) setLogs(result); }
      } catch (e) { if (!canceled) setError((e as Error).message); }
    };
    refresh(); const timer = setInterval(refresh, page === 'logs' ? 1500 : 5000);
    return () => { canceled = true; clearInterval(timer); };
  }, [page, state?.running, state?.selectedProfile, state?.profiles.find(p => p.id === state.selectedProfile)?.updatedAt, api]);
  useEffect(() => { setQuery(''); }, [page]);
  useEffect(() => { setDelays({}); }, [state?.selectedProfile]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) setModal(null);
      if (event.key === 'Tab' && dialog) {
        const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, [tabindex="0"]')];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [modal]);
  const run = async (label: string, task: (api: LumaAPI) => Promise<unknown>) => {
    if (!api || busyRef.current) return;
    busyRef.current = true; setBusy(label); setError('');
    try {
      const result = await task(api);
      if (result && typeof result === 'object' && 'coreVersion' in result) setState(result as AppState);
    } catch (e) { setError((e as Error).message); }
    finally { busyRef.current = false; setBusy(''); }
  };
  const navigate = (next: Page) => { setPage(next); setError(''); };
  const controlWindow = (action: string) => { void api?.window({ action }).catch(e => setError(e.message)); };
  const importModal = () => { setError(''); setName(''); setSource(''); setImportTab('url'); setModal('import'); };
  const editProfile = (profile: Profile) => run('打开配置', async a => { const content = await a.profileContent({ id: profile.id }); setEditing(profile); setName(profile.name); setSource(content); setModal('edit'); });
  const selectedProfile = state?.profiles.find(p => p.id === state.selectedProfile);
  const testNode = async (a: LumaAPI, node: string) => { try { const data = await a.delay({ name: node }); setDelays(d => ({ ...d, [node]: data.delay })); } catch { setDelays(d => ({ ...d, [node]: 'timeout' })); } };
  const groups = Object.values(proxies).filter(p => p.all && !p.hidden && (state?.mode === 'global' || p.name !== 'GLOBAL'));
  const filteredConnections = stats.connections.filter(c => `${c.metadata.host} ${c.metadata.destinationIP} ${c.metadata.process} ${c.chains.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  if (!api) return <div className="browser-message"><Network size={44}/><h1>Luma</h1><p>这是桌面客户端，请打开 Luma 应用使用。</p><code>npm run dev</code></div>;
  if (!state) return <div className="loading-screen"><LoaderCircle className="spin"/><p>{error || '正在连接本地工作空间…'}</p></div>;
  const metric = (label: string, value: number, icon: Icon, caption: string, speed = true) => {
    const Icon = icon; const b = bytes(value, speed);
    return <div className="metric card"><div className="metric-label">{label}<Icon size={17}/></div><div className="metric-number">{b.value}<span>{b.unit}</span></div><div className="metric-caption">{caption}</div></div>;
  };
  const resumeLabel = state.coreError ? '重试启动' : '恢复运行';
  const stopped = state.starting ? <Empty icon={LoaderCircle} title="正在启动内核" text="正在自动加载当前配置，请稍候。"/> : <Empty icon={Power} title={state.coreError ? '内核启动失败' : '内核已停止'} text={state.coreError || '恢复运行后，这里会显示实时数据。'} action={<button className="button primary" disabled={!!busy} onClick={() => run(resumeLabel, a => a.start())}><Play size={15}/>{resumeLabel}</button>}/>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="mac-drag">{state.platform === 'darwin' && <div className="mac-window-controls" role="group" aria-label="窗口控制">
        <button className="mac-control close" aria-label="关闭窗口" title="关闭窗口" onClick={() => controlWindow('close')}><X size={9} strokeWidth={2.5}/></button>
        <button className="mac-control minimize" aria-label="最小化窗口" title="最小化窗口" onClick={() => controlWindow('minimize')}><Minus size={9} strokeWidth={2.5}/></button>
        <button className="mac-control zoom" aria-label="放大或还原窗口" title="放大或还原窗口" onClick={() => controlWindow('maximize')}><ArrowUpRight size={9} strokeWidth={2.5}/></button>
      </div>}</div>
      <div className="brand"><div className="brand-mark"><Network size={24} strokeWidth={1.8}/></div><div><strong>Luma<span> 流光</span></strong><small>让连接，自由发生</small></div></div>
      <div className="nav-label">工作空间</div>
      <nav aria-label="主导航">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)} aria-current={page === id ? 'page' : undefined}><Icon size={19} strokeWidth={1.7}/><span>{label}</span>{id === 'connections' && stats.connectionCount > 0 && <small>{stats.connectionCount}</small>}{page === id && <span className="nav-active-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="help-link" onClick={() => run('打开文档', a => a.openDocs())}><CircleHelp size={17}/>使用文档<ArrowUpRight size={14}/></button><div className="kernel-mini"><div className="kernel-mini-icon"><Command size={17}/></div><div><strong>Mihomo 内核</strong><small>{state.coreVersion || '尚未下载'}</small></div><span className={`dot ${state.running ? 'green' : 'gray'}`}/></div><div className="sidebar-version">Luma <span>v{state.appVersion}</span></div></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><div className="breadcrumb">工作空间<ChevronRight size={13}/><span>{navigation.find(n => n.id === page)?.label}</span></div><div className="topbar-right"><span className="local-badge"><span className="dot green"/>本地工作空间</span><button className="icon-button" aria-label="打开设置" onClick={() => navigate('settings')}><SlidersHorizontal size={17}/></button>{state.platform !== 'darwin' && <div className="window-controls"><button onClick={() => api.window({ action: 'minimize' })} aria-label="最小化"><Minus size={15}/></button><button onClick={() => api.window({ action: 'maximize' })} aria-label="最大化"><Square size={12}/></button><button onClick={() => api.window({ action: 'close' })} aria-label="关闭窗口"><X size={16}/></button></div>}</div></header>
      <div className={`page-scroll ${page === 'proxies' ? 'proxy-page' : ''}`}>
        <div className="page-heading"><div><div className="eyebrow">{page === 'overview' ? 'YOUR NETWORK, AT A GLANCE' : 'LUMA / WORKSPACE'}</div><h1>{({ overview: '网络，尽在掌握。', proxies: '代理组', profiles: '你的配置，一处管理。', connections: '看见每一条连接。', rules: '让流量，各行其道。', logs: '运行细节，清晰可见。', settings: '按照你的习惯。' })[page]}</h1><p>{({ overview: '连接状态与实时流量，在这里一目了然。', proxies: '点击代理组展开节点，选择适合当前网络的线路。', profiles: '导入 Clash / mihomo 配置，在不同网络间轻松切换。', connections: '查看实时请求、流量与流量经过的代理链。', rules: '按顺序匹配的分流规则，来自当前活动配置。', logs: '来自本地 mihomo 进程的实时运行日志。', settings: '调整连接方式与桌面客户端偏好。' })[page]}</p></div>{page === 'profiles' ? <button className="button primary" onClick={importModal}><Plus size={17}/>导入配置</button> : <button className={`button ${state.running ? 'quiet' : 'primary'}`} disabled={!!busy || state.starting} onClick={() => run(state.running ? '停止内核' : resumeLabel, a => state.running ? a.stop() : a.start())}>{busy || state.starting ? <LoaderCircle size={16} className="spin"/> : <Power size={16}/>} {busy || (state.starting ? '正在启动…' : state.running ? '停止内核' : resumeLabel)}</button>}</div>
        {error && <div className="alert" role="alert"><span>{error}</span><button className="icon-button" aria-label="关闭错误" onClick={() => setError('')}><X size={16}/></button></div>}
        {page === 'overview' && <>
          <div className={`status-banner ${state.running ? 'connected' : ''}`}><div className="status-symbol"><ShieldCheck size={23}/></div><div className="status-copy"><strong>{state.running ? '内核正在运行' : state.starting ? '正在启动内核' : state.coreError ? '内核启动失败' : '内核已停止'}</strong><span>{state.running ? `mihomo ${state.coreVersion} · ${state.systemProxy ? '系统代理已开启' : '本地代理已就绪，系统代理未开启'}` : state.starting ? '正在自动加载当前配置，请稍候。' : state.coreError || '内核已暂停，恢复运行即可继续使用。'}</span></div><div className="status-uptime"><span className={`dot ${state.running ? 'green' : 'gray'}`}/>{state.running ? '运行时间' : '当前状态'}<strong>{state.running ? uptime(stats.uptime) : state.starting ? '启动中' : state.coreError ? '启动失败' : '已停止'}</strong></div></div>
          <div className="metrics-grid">{metric('下载速度', stats.download, ArrowDownLeft, `累计下载 ${size(stats.downloadTotal)}`)}{metric('上传速度', stats.upload, ArrowUpRight, `累计上传 ${size(stats.uploadTotal)}`)}<div className="metric card"><div className="metric-label">活跃连接<Waypoints size={17}/></div><div className="metric-number">{stats.connectionCount}<span>个</span></div><button className="metric-link" onClick={() => navigate('connections')}>查看所有连接<ArrowRight size={12}/></button></div>{metric('内核内存', stats.memory, HardDrive, state.running ? '实时内存占用' : '启动后显示', false)}</div>
          <section className="card traffic-card"><CardTitle icon={Activity} title="实时流量" action={<div className="chart-legend"><span><i/>下载</span><span><i/>上传</span><span className="live-label">LIVE</span></div>}/><Chart history={history}/></section>
          <div className="overview-bottom"><section className="card controls-card"><CardTitle icon={SlidersHorizontal} title="连接控制"/><div className="setting-row"><div className="row-icon"><Globe2 size={19}/></div><div className="setting-copy"><strong>系统代理</strong><span>让支持系统代理的应用通过 mihomo 连接</span></div><Toggle label="系统代理" checked={state.systemProxy} disabled={!state.running || !!busy} onChange={() => run('设置系统代理', a => a.setSystemProxy({ enabled: !state.systemProxy }))}/></div><div className="mode-row"><div><strong>代理模式</strong><span>根据规则自动分配流量</span></div><div className="segmented">{Object.entries(modeLabels).map(([mode, label]) => <button key={mode} className={state.mode === mode ? 'selected' : ''} disabled={!!busy} onClick={() => run('切换模式', a => a.setMode({ mode: mode as AppState['mode'] }))}>{label}</button>)}</div></div><div className="port-info"><span>本地混合端口</span><code>127.0.0.1:{state.port}</code><button className="icon-button" aria-label="复制代理地址" onClick={async () => { try { await navigator.clipboard.writeText(`http://127.0.0.1:${state.port}`); setNotice('代理地址已复制'); } catch { setError('无法复制，请手动复制代理地址'); } }}><Copy size={13}/></button></div></section><section className="card current-profile"><CardTitle icon={Layers3} title="当前配置" action={<button className="text-button" onClick={() => navigate('profiles')}>管理<ChevronRight size={14}/></button>}/><div className="profile-preview"><div className="file-symbol"><FileCode2 size={27} strokeWidth={1.4}/></div><div><h3>{selectedProfile?.name}</h3><p>{selectedProfile?.source} <span>·</span> YAML 配置</p></div><span className="pill green-pill">使用中</span></div><div className="profile-meta"><span><span className="dot green"/>已保存在本机</span><span>{selectedProfile ? new Date(selectedProfile.updatedAt).toLocaleDateString('zh-CN') : ''} 更新</span></div><button className="profile-import-link" onClick={importModal}><Plus size={15}/><span>添加新的订阅或本地配置</span><ArrowRight size={15}/></button></section></div>
          <div className="page-footnote"><ShieldCheck size={13}/>配置和连接数据保存在本机<span>POWERED BY MIHOMO</span></div>
        </>}
        {page === 'profiles' && <>
          <div className="toolbar"><span className="section-note">全部配置 <span className="count">{state.profiles.length}</span></span><button className="button small" disabled={!!busy} onClick={() => run('导入本地配置', a => a.importFile())}><FolderOpen size={15}/>从文件导入</button></div>
          <div className="profiles-grid">{state.profiles.map(profile => <section key={profile.id} className={`card profile-card ${profile.id === state.selectedProfile ? 'is-selected' : ''}`}><div className="profile-card-top"><div className="file-symbol">{profile.kind === 'remote' ? <Link2 size={24}/> : <FileCode2 size={25}/>}</div>{profile.id === state.selectedProfile && <span className="pill green-pill"><Check size={12}/>当前配置</span>}<div className="profile-card-tools">{profile.kind === 'remote' && <button className="icon-button" aria-label={`更新 ${profile.name}`} disabled={!!busy} onClick={() => run('更新订阅', a => a.updateProfile({ id: profile.id }))}><RefreshCw size={15}/></button>}<button className="icon-button" aria-label={`删除 ${profile.name}`} disabled={!!busy || profile.id === state.selectedProfile} onClick={() => run('删除配置', a => a.deleteProfile({ id: profile.id }))}><Trash2 size={15}/></button></div></div><h3>{profile.name}</h3><p>{profile.source}</p><div className="profile-time">{new Date(profile.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 更新 · {profile.kind === 'remote' ? '远程订阅' : '本地配置'}</div><div className="profile-actions"><button className="button small" disabled={!!busy} onClick={() => editProfile(profile)}><FileCode2 size={14}/>编辑配置</button><button className={`button small ${profile.id === state.selectedProfile ? 'selected-button' : 'primary'}`} disabled={!!busy || profile.id === state.selectedProfile} onClick={() => run('切换配置', a => a.selectProfile({ id: profile.id }))}>{profile.id === state.selectedProfile ? <><Check size={14}/>使用中</> : <>使用配置<ArrowRight size={14}/></>}</button></div></section>)}<button className="add-profile-card" onClick={importModal}><span><Plus size={22}/></span><strong>添加配置</strong><small>订阅链接或 YAML 内容</small></button></div>
          <div className="info-note"><CircleHelp size={16}/><p>支持完整 Clash / mihomo YAML 订阅。单条节点链接和 Base64 订阅请先转换为完整配置。订阅需要手动更新。</p></div>
        </>}
        {page === 'proxies' && <>
          <div className="toolbar proxy-toolbar"><div className="search-box"><Search size={16}/><input aria-label="搜索节点" placeholder="搜索节点或代理组…" value={query} onChange={e => setQuery(e.target.value)}/></div><div className="segmented" role="group" aria-label="出站模式">{Object.entries(modeLabels).map(([mode, label]) => <button key={mode} className={state.mode === mode ? 'selected' : ''} aria-pressed={state.mode === mode} disabled={!!busy} onClick={() => run('切换模式', a => a.setMode({ mode: mode as AppState['mode'] }))}>{label}</button>)}</div></div>
          {!state.running ? stopped : groups.length === 0 ? <Empty icon={Globe2} title="配置中没有代理组" text="导入包含 proxy-groups 的配置后选择节点。" action={<button className="button" onClick={importModal}>导入配置</button>}/> : <ProxyGroups key={state.selectedProfile} profileId={state.selectedProfile} groups={groups} proxies={proxies} query={query} busy={!!busy} delays={delays} selectNode={(group, name) => { void run('切换节点', async a => { await a.selectProxy({ group, name }); setProxies(await a.proxies()); }); }} testGroup={nodes => { void run('测试延迟', async a => { for (let i = 0; i < nodes.length; i += 5) await Promise.all(nodes.slice(i, i + 5).map(n => testNode(a, n))); }); }}/>}
        </>}
        {page === 'connections' && <>
          <div className="toolbar"><div className="search-box"><Search size={16}/><input aria-label="搜索连接" placeholder="搜索域名、IP 或进程…" value={query} onChange={e => setQuery(e.target.value)}/></div><button className="button small" disabled={!!busy || !stats.connections.length} onClick={() => run('断开连接', a => a.closeConnection({}))}><X size={14}/>断开全部</button></div>
          {!state.running ? stopped : !filteredConnections.length ? <Empty icon={Waypoints} title={query ? '没有匹配的连接' : '还没有活跃连接'} text={query ? '尝试其他关键词。' : '开启系统代理后，这里会显示活跃连接。'}/> : <div className="card table-wrap"><table><thead><tr><th>目标地址</th><th>代理链 / 规则</th><th>下载 / 上传</th><th>协议</th><th/></tr></thead><tbody>{filteredConnections.map(c => <tr key={c.id}><td><strong>{c.metadata.host || c.metadata.destinationIP}</strong><small>{c.metadata.process || c.metadata.sourceIP} → :{c.metadata.destinationPort}</small></td><td>{c.chains.join(' → ')}<small>{c.rule}</small></td><td>{size(c.download)}<small>{size(c.upload)}</small></td><td><span className="pill">{c.metadata.network}</span></td><td><button className="icon-button" aria-label={`断开 ${c.metadata.host || c.metadata.destinationIP}`} disabled={!!busy} onClick={() => run('断开连接', a => a.closeConnection({ id: c.id }))}><X size={15}/></button></td></tr>)}</tbody></table></div>}
        </>}
        {page === 'rules' && <>
          <div className="toolbar"><div className="search-box"><Search size={16}/><input aria-label="搜索规则" placeholder="搜索规则、类型或策略…" value={query} onChange={e => setQuery(e.target.value)}/></div><span className="section-note">{rules.length} 条规则 · 从上到下匹配</span></div>
          {!state.running ? stopped : <div className="card table-wrap"><table><thead><tr><th className="number-col">顺序</th><th>类型</th><th>匹配内容</th><th>策略</th></tr></thead><tbody>{rules.map((rule, i) => ({ ...rule, i })).filter(r => `${r.type} ${r.payload} ${r.proxy}`.toLowerCase().includes(query.toLowerCase())).map(r => <tr key={r.i}><td className="muted">{String(r.i + 1).padStart(2, '0')}</td><td><span className="pill">{r.type}</span></td><td className="mono">{r.payload || '*'}</td><td><span className="strategy-label"><ArrowUpRight size={13}/>{r.proxy}</span></td></tr>)}</tbody></table>{rules.filter(r => `${r.type} ${r.payload} ${r.proxy}`.toLowerCase().includes(query.toLowerCase())).length === 0 && <Empty title="没有匹配的规则" text="尝试其他关键词，或编辑当前配置。"/>}</div>}
        </>}
        {page === 'logs' && <>
          <div className="toolbar"><div className="search-box"><Search size={16}/><input aria-label="搜索日志" placeholder="搜索运行日志…" value={query} onChange={e => setQuery(e.target.value)}/></div><div className="select-wrap"><select aria-label="日志级别" value={logLevel} onChange={e => setLogLevel(e.target.value)}><option value="all">所有级别</option><option value="info">信息</option><option value="warning">警告</option><option value="error">错误</option></select><ChevronDown size={14}/></div></div>
          <section className="card logs-card"><div className="log-header"><span className={`dot ${state.running ? 'green' : 'gray'}`}/>{state.running ? '实时更新中' : '内核已停止'}<span>保留最近 500 条</span></div><div className="log-list">{logs.filter(l => (logLevel === 'all' || logLevel === l.level) && l.message.toLowerCase().includes(query.toLowerCase())).map((l, i) => <div className="log-line" key={`${l.time}-${i}`}><time>{new Date(l.time).toLocaleTimeString('zh-CN', { hour12: false })}</time><span className={`log-level ${l.level}`}>{l.level.toUpperCase()}</span><span>{l.message}</span></div>)}{logs.length === 0 && <Empty icon={Terminal} title="暂无运行日志" text="启动内核后，日志会自动显示在这里。"/>}</div></section>
        </>}
        {page === 'settings' && <Settings state={state} busy={busy} run={run} notify={setNotice}/>}
      </div>
      <footer className="statusbar"><span><span className={`dot ${state.running ? 'green' : 'gray'}`}/>{state.running ? '内核运行中' : state.starting ? '内核启动中' : state.coreError ? '内核启动失败' : '内核已停止'}<i/>混合端口 {state.port}</span><span><ArrowDown size={12}/>{size(stats.download)}/s<ArrowUp size={12}/>{size(stats.upload)}/s<i/>{modeLabels[state.mode]}模式</span></footer>
    </main>
    {notice && <div className="toast" role="status"><CheckCheck size={17}/>{notice}</div>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setModal(null); }}><section className={`modal ${modal === 'edit' ? 'editor-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div className="file-symbol"><FilePlus2 size={24}/></div><button className="icon-button" disabled={!!busy} aria-label="关闭对话框" onClick={() => setModal(null)}><X size={19}/></button></div><h2 id="modal-title">{modal === 'edit' ? '编辑配置' : '添加一个新配置'}</h2><p>{modal === 'edit' ? '保存时会校验配置，活动配置会立即重新加载。' : '连接你的订阅，或导入一份完整的 YAML 配置。'}</p>{modal === 'import' && <div className="modal-tabs"><button className={importTab === 'url' ? 'selected' : ''} onClick={() => { setImportTab('url'); setSource(''); }}><Link2 size={15}/>订阅链接</button><button className={importTab === 'yaml' ? 'selected' : ''} onClick={() => { setImportTab('yaml'); setSource(''); }}><FileCode2 size={15}/>YAML 内容</button></div>}<form onSubmit={e => { e.preventDefault(); run(modal === 'edit' ? '保存配置' : '导入配置', async a => { let result; if (modal === 'edit' && editing) { result = await a.saveProfile({ id: editing.id, content: source }); if (name.trim() !== editing.name) result = await a.renameProfile({ id: editing.id, name }); } else result = await a.importProfile({ name, ...(importTab === 'url' ? { url: source.trim() } : { content: source }) }); setModal(null); setNotice(modal === 'edit' ? '配置已保存' : '配置已导入，选择“使用配置”即可生效'); return result; }); }}><label>配置名称<input required maxLength={80} placeholder="例如：我的订阅" value={name} onChange={e => setName(e.target.value)}/></label><label>{modal === 'edit' || importTab === 'yaml' ? 'YAML 配置' : '订阅地址'}{modal === 'edit' || importTab === 'yaml' ? <textarea className="yaml-editor" required spellCheck={false} placeholder={'proxies: []\nproxy-groups: []\nrules: [MATCH,DIRECT]'} value={source} onChange={e => setSource(e.target.value)}/> : <input type="url" required placeholder="https://example.com/subscribe?token=…" value={source} onChange={e => setSource(e.target.value)}/>}</label>{error && <div className="modal-error" role="alert">{error}</div>}<div className="modal-hint"><ShieldCheck size={14}/>订阅地址和配置仅保存在本机</div><div className="modal-actions"><button className="button" type="button" disabled={!!busy} onClick={() => setModal(null)}>取消</button><button className="button primary" disabled={!!busy} type="submit">{busy ? <LoaderCircle size={15} className="spin"/> : modal === 'edit' ? <Check size={15}/> : <Download size={15}/>} {busy || (modal === 'edit' ? '保存配置' : '导入配置')}</button></div></form></section></div>}
  </div>;
}
