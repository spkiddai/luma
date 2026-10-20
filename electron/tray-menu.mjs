const modeNames = { rule: '规则', global: '全局', direct: '直连' };
const separator = () => ({ type: 'separator' });

export function trayMenuTemplate({ state, proxies = {}, dispatch }) {
  const action = (name, data) => () => dispatch(name, data);
  const reveal = (page, importProfile = false) => action('reveal', { page, importProfile });
  const active = state.profiles.find(p => p.id === state.selectedProfile);
  const groups = Object.values(proxies).filter(p => p.all && !p.hidden && (state.mode === 'global' || p.name !== 'GLOBAL'));
  const profileItems = state.profiles.map(p => ({ id: `profile:${p.id}`, label: p.name, type: 'radio', checked: p.id === state.selectedProfile, click: action('selectProfile', { id: p.id }) }));
  const proxyItems = groups.map(group => ({
    id: `group:${group.name}`, label: group.name,
    submenu: group.all.length ? group.all.map(name => ({
      id: `proxy:${group.name}:${name}`, label: name, type: 'radio', checked: group.now === name,
      enabled: ['Selector', 'URLTest', 'Fallback'].includes(group.type), click: action('selectProxy', { group: group.name, name }),
    })) : [{ label: '暂无可用节点', enabled: false }],
  }));
  return [
    { id: 'dashboard', label: '仪表板', click: reveal('overview') }, separator(),
    { id: 'mode', label: `出站模式（${modeNames[state.mode]}）`, submenu: ['rule', 'global', 'direct'].map(mode => ({ id: `mode:${mode}`, label: `${modeNames[mode]}模式`, type: 'radio', checked: state.mode === mode, click: action('setMode', { mode }) })) },
    separator(),
    { id: 'profiles', label: '订阅', submenu: [
      ...profileItems, ...(profileItems.length ? [separator()] : []),
      { id: 'import-profile', label: '添加订阅…', click: reveal('profiles', true) },
      { id: 'import-file', label: '从文件导入…', click: action('importFile') }, separator(),
      { id: 'update-profile', label: '更新当前订阅', enabled: active?.kind === 'remote', click: action('updateProfile', { id: active?.id }) },
      { id: 'update-all-profiles', label: '更新全部订阅', enabled: state.profiles.some(p => p.kind === 'remote'), click: action('updateAllProfiles') },
      { id: 'manage-profiles', label: '管理配置…', click: reveal('profiles') },
    ] },
    { id: 'proxies', label: '代理', submenu: [
      ...(state.running ? proxyItems.length ? proxyItems : [{ label: '暂无代理组', enabled: false }] : [{ label: '内核未启动', enabled: false }]),
      separator(), { label: '打开代理面板…', click: reveal('proxies') },
    ] }, separator(),
    { id: 'system-proxy', label: '系统代理', type: 'checkbox', checked: state.systemProxy, enabled: state.running, click: action('setSystemProxy', { enabled: !state.systemProxy }) },
    separator(),
    { id: 'lightweight', label: '轻量模式', type: 'checkbox', checked: Boolean(state.lightweightMode), click: action('setLightweight', { enabled: !state.lightweightMode }) },
    { id: 'directories', label: '打开目录', submenu: [
      { label: '本地配置目录', click: action('openDirectory', { kind: 'profiles' }) }, { label: '本地应用目录', click: action('openData') }, { label: '日志目录', click: action('openDirectory', { kind: 'logs' }) },
    ] },
    { id: 'more', label: '更多', submenu: [
      { id: 'toggle-core', label: state.starting ? '正在启动…' : state.running ? '停止内核' : state.coreError ? '重试启动' : '恢复运行', enabled: !state.starting, click: action(state.running ? 'stop' : 'start') },
      { id: 'restart-core', label: '重启内核', enabled: state.running, click: action('restart') }, separator(),
      { id: 'launch-at-login', label: '开机启动', type: 'checkbox', checked: state.launchAtLogin, click: action('settings', { launchAtLogin: !state.launchAtLogin }) },
      separator(),
      { label: '复制代理地址', click: action('copyProxy') }, { label: '复制终端代理命令', click: action('copyProxy', { terminal: true }) }, separator(),
      { label: '运行日志…', click: reveal('logs') }, { label: '设置…', click: reveal('settings') },
      { label: '使用文档', click: action('openDocs') }, { label: '关于 Luma', click: action('about') },
    ] }, separator(),
    { id: 'quit', label: '退出', accelerator: 'CmdOrCtrl+Q', click: action('quit') },
  ];
}
