import { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, clipboard } from 'electron';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Store, downloadProfile } from './store.mjs';
import { Core } from './core.mjs';
import { SystemProxy } from './system-proxy.mjs';
import { validMode } from './config.mjs';
import { trayMenuTemplate } from './tray-menu.mjs';
import { updatePreferences } from './preferences.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testing = process.env.LUMA_TEST_MODE === '1';
app.setName('Luma');
if (process.env.LUMA_DATA_DIR) app.setPath('userData', process.env.LUMA_DATA_DIR);
else if (!testing) {
  // Reuse an existing installation's private data; never copy it into the app bundle.
  const legacy = path.join(app.getPath('appData'), 'Mihomo Desk');
  if (!existsSync(path.join(app.getPath('userData'), 'settings.json')) && existsSync(path.join(legacy, 'settings.json'))) app.setPath('userData', legacy);
}
if (!app.requestSingleInstanceLock()) app.quit();
else boot().catch(error => { dialog.showErrorBox('Luma 无法启动', error.message); app.exit(1); });

async function boot() {
  let window, tray, trayMenu, store, core, systemProxy, windowPromise, quitting = false, queue = Promise.resolve();
  let proxyCache = {}, revealWindow = async () => {}, bootComplete = false, starting = true, coreError = '';
  const serialize = fn => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };
  const report = error => { core?.log('error', error.message); dialog.showErrorBox('操作失败', error.message); };
  const show = () => { void revealWindow().catch(report); };
  app.on('second-instance', show);
  app.on('activate', () => { if (bootComplete) show(); });
  app.on('window-all-closed', () => { if (!tray && bootComplete && !quitting) app.quit(); });
  await app.whenReady();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Luma', submenu: [{ role: 'about' }, { type: 'separator' }, { label: '退出 Luma', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { label: '显示主窗口', click: show }] },
  ]));
  const directory = app.getPath('userData');
  let lastOpenedDirectory;
  try {
    store = await new Store(directory).init();
    if (!testing && store.state.launchAtLogin) app.setLoginItemSettings({ openAtLogin: true });
    systemProxy = new SystemProxy(directory);
    const os = { darwin: 'mac', win32: 'win', linux: 'linux' }[process.platform];
    const binary = path.join(app.isPackaged ? path.join(process.resourcesPath, 'core') : path.join(root, 'resources/core', `${os}-${process.arch}`), process.platform === 'win32' ? 'mihomo.exe' : 'mihomo');
    const geodataDirectory = app.isPackaged ? path.join(process.resourcesPath, 'geodata') : path.join(root, 'resources/geodata');
    core = new Core({ binary, directory, store, geodataDirectory, onExit: () => serialize(async () => { await systemProxy.disable(); await updateTray(); }) });
    await systemProxy.recover().catch(e => core.log('error', `恢复系统代理失败：${e.message}`));
    await core.detect();
    starting = store.state.autoStart;
  } catch (e) { dialog.showErrorBox('Luma 无法启动', e.message); app.exit(1); return; }
  const state = () => ({ ...store.publicState(), running: core.running, starting, coreError, coreVersion: core.version, systemProxy: systemProxy.enabled, platform: process.platform, appVersion: app.getVersion(), dataDirectory: directory, profilesDirectory: path.join(directory, 'profiles'), lanAddresses: [...new Set(Object.values(networkInterfaces()).flat().filter(info => info && !info.internal && info.family === 'IPv4').map(info => info.address))] });
  const updateTray = async () => {
    if (!tray) return;
    proxyCache = await core.proxies().catch(() => ({}));
    tray.setToolTip(`Luma · ${core.running ? '运行中' : '已停止'}`);
    trayMenu = Menu.buildFromTemplate(trayMenuTemplate({ state: state(), proxies: proxyCache, dispatch: (action, data) => { void executeAction(action, data).catch(report); } }));
    if (process.platform !== 'darwin') tray.setContextMenu(trayMenu);
  };
  const addProfile = async data => {
    if (!data || typeof data !== 'object') throw new Error('无效的配置');
    const content = data.url ? await downloadProfile(data.url) : data.content;
    await core.validate(content);
    await store.add({ name: data.name, content, url: data.url });
    return state();
  };
  const handlers = {
    state, stats: options => core.snapshot(options), logs: () => core.logs,
    start: async () => {
      starting = true; coreError = '';
      try { await core.start(); }
      catch (error) { coreError = error.message.replaceAll(core.secret, '[redacted]'); throw error; }
      finally { starting = false; }
      return state();
    },
    stop: async () => { await systemProxy.disable(); await core.stop(); return state(); },
    restart: async () => {
      const proxy = systemProxy.enabled;
      await systemProxy.disable(); await core.stop(); await handlers.start();
      if (proxy) await systemProxy.enable(store.state.port);
      return state();
    },
    proxies: () => core.proxies(),
    selectProxy: async ({ group, name }) => { await core.request(`/proxies/${encodeURIComponent(group)}`, { method: 'PUT', body: JSON.stringify({ name }) }); },
    delay: ({ name }) => core.request(`/proxies/${encodeURIComponent(name)}/delay?url=${encodeURIComponent('https://www.gstatic.com/generate_204')}&timeout=5000`),
    rules: async () => core.running ? (await core.request('/rules')).rules : [],
    closeConnection: async ({ id }) => { if (id !== undefined && typeof id !== 'string') throw new Error('无效连接'); await core.request(`/connections${id ? `/${encodeURIComponent(id)}` : ''}`, { method: 'DELETE' }); },
    setMode: async ({ mode }) => {
      validMode(mode);
      if (core.running) await core.request('/configs', { method: 'PATCH', body: JSON.stringify({ mode }) });
      store.state.mode = mode; await store.save(); return state();
    },
    setSystemProxy: async ({ enabled }) => {
      if (typeof enabled !== 'boolean') throw new Error('无效的代理设置');
      if (testing) throw new Error('自动化测试中禁止修改系统代理');
      if (enabled) { if (!core.running) throw new Error('请先启动内核'); await systemProxy.enable(store.state.port); }
      else await systemProxy.disable();
      return state();
    },
    importFile: async () => {
      if (!window || window.isDestroyed()) await revealWindow({ page: 'profiles' });
      const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Clash / mihomo 配置', extensions: ['yaml', 'yml'] }] });
      if (result.canceled) return state();
      const file = result.filePaths[0];
      return addProfile({ name: path.basename(file).replace(/\.ya?ml$/i, ''), content: await readFile(file, 'utf8') });
    },
    importProfile: addProfile,
    selectProfile: async ({ id }) => {
      const content = await store.content(id); await core.apply(content);
      store.state.selectedProfile = id; await store.save();
      if (coreError) await handlers.start();
      return state();
    },
    updateProfile: async ({ id }) => {
      const profile = store.profile(id);
      if (!profile.url) throw new Error('本地配置请通过编辑器修改');
      const content = await downloadProfile(profile.url);
      if (id === store.state.selectedProfile) await core.apply(content); else await core.validate(content);
      await store.update(id, content); return state();
    },
    deleteProfile: async ({ id }) => { await store.remove(id); return state(); },
    updateAllProfiles: async () => {
      const failures = [];
      for (const profile of store.state.profiles.filter(p => p.kind === 'remote')) {
        try { await handlers.updateProfile({ id: profile.id }); } catch (error) { failures.push(`${profile.name}：${error.message}`); }
      }
      if (failures.length) throw new Error(failures.join('\n'));
      return state();
    },
    profileContent: ({ id }) => store.content(id),
    saveProfile: async ({ id, content }) => {
      store.profile(id);
      if (id === store.state.selectedProfile) await core.apply(content); else await core.validate(content);
      await store.update(id, content);
      if (id === store.state.selectedProfile && coreError) await handlers.start();
      return state();
    },
    renameProfile: async ({ id, name }) => {
      if (typeof name !== 'string' || !name.trim()) throw new Error('配置名称不能为空');
      store.profile(id).name = name.trim().slice(0, 80); await store.save(); return state();
    },
    settings: async data => {
      await updatePreferences({ store, core, systemProxy, setLoginItemSettings: options => { if (!testing) app.setLoginItemSettings(options); } }, data);
      return state();
    },
    openData: () => handlers.openDirectory({ kind: 'data' }),
    openDirectory: async ({ kind }) => {
      const folder = { data: directory, profiles: path.join(directory, 'profiles'), logs: app.getPath('logs') }[kind];
      if (!folder) throw new Error('未知目录');
      await mkdir(folder, { recursive: true });
      if (testing) { lastOpenedDirectory = folder; return; }
      const error = await shell.openPath(folder); if (error) throw new Error(error);
    },
    copyProxy: (data = {}) => { clipboard.writeText(data.terminal ? `export http_proxy=http://127.0.0.1:${store.state.port}\nexport https_proxy=http://127.0.0.1:${store.state.port}\nexport all_proxy=socks5://127.0.0.1:${store.state.port}` : `http://127.0.0.1:${store.state.port}`); },
    openDocs: () => shell.openExternal('https://wiki.metacubex.one/'),
    about: () => app.showAboutPanel(),
    reveal: data => revealWindow(data),
    setLightweight: async ({ enabled }) => {
      if (enabled && !tray) throw new Error('菜单栏尚未就绪，无法进入轻量模式');
      store.state.lightweightMode = Boolean(enabled); await store.save();
      if (enabled) { window?.destroy(); window = null; if (process.platform === 'darwin') app.dock.hide(); }
      else await revealWindow();
      return state();
    },
    window: ({ action }) => {
      if (!window || window.isDestroyed()) throw new Error('窗口已关闭');
      if (action === 'minimize') window.minimize();
      else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
      else if (action === 'close') window.close();
      else throw new Error('无效的窗口操作');
    },
    quit: () => { app.quit(); },
  };
  // Window controls must remain responsive while a subscription is downloading.
  const directActions = new Set(['state', 'stats', 'logs', 'proxies', 'rules', 'profileContent', 'delay', 'window']);
  const executeAction = (action, data) => serialize(async () => {
    try { return await handlers[action](data); }
    finally { await updateTray(); }
  });
  ipcMain.handle('luma:action', async (event, action, data) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) return { ok: false, error: '无效请求来源' };
    if (!Object.hasOwn(handlers, action)) return { ok: false, error: '未知操作' };
    try { return { ok: true, data: await (directActions.has(action) ? handlers[action](data) : executeAction(action, data)) }; }
    catch (e) { return { ok: false, error: e.message.replaceAll(core.secret, '[redacted]') }; }
  });
  async function createWindow(navigation = {}) {
    if (windowPromise) return windowPromise;
    if (window && !window.isDestroyed()) return window;
    windowPromise = (async () => {
    const nextWindow = new BrowserWindow({
    width: 1220, height: 920, minWidth: 980, minHeight: 680, show: false,
    title: 'Luma', backgroundColor: '#f7f9f8', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 21, y: 22 }, icon: path.join(root, 'resources/icon.png'),
    webPreferences: { preload: path.join(root, 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      additionalArguments: [`--luma-page=${navigation.page || 'overview'}`, `--luma-import-profile=${navigation.importProfile ? '1' : '0'}`] },
  });
    window = nextWindow;
    // Render our own controls outside macOS's window-sharing indicator region.
    if (process.platform === 'darwin') nextWindow.setWindowButtonVisibility(false);
    nextWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    nextWindow.webContents.on('will-navigate', event => event.preventDefault());
    nextWindow.webContents.on('will-attach-webview', event => event.preventDefault());
    nextWindow.on('close', event => { if (!quitting && tray) { event.preventDefault(); nextWindow.hide(); } });
    nextWindow.on('closed', () => { if (window === nextWindow) window = null; });
    nextWindow.once('ready-to-show', () => nextWindow.show());
    if (process.env.ELECTRON_RENDERER_URL && !app.isPackaged) await nextWindow.loadURL('http://127.0.0.1:5173');
    else await nextWindow.loadFile(path.join(root, 'dist/index.html'));
    return nextWindow;
    })();
    try { return await windowPromise; } finally { windowPromise = null; }
  }
  revealWindow = async (navigation = {}) => {
    if (store.state.lightweightMode) { store.state.lightweightMode = false; await store.save(); }
    if (process.platform === 'darwin') await app.dock.show();
    const target = await createWindow(navigation);
    if (target.isMinimized()) target.restore();
    target.show(); target.focus();
    if (navigation.page) target.webContents.send('luma:navigate', navigation);
    await updateTray();
  };
  if (!testing || process.env.LUMA_TEST_TRAY === '1') {
    try {
      const image = nativeImage.createFromPath(path.join(root, 'resources/tray.png')); image.setTemplateImage(true);
      tray = new Tray(image);
      if (process.platform === 'darwin') {
        tray.setIgnoreDoubleClickEvents(true);
        let openingMenu = false;
        const popup = async () => {
          if (openingMenu || quitting) return;
          openingMenu = true;
          try { await updateTray(); tray.popUpContextMenu(trayMenu); } catch (error) { report(error); }
          finally { openingMenu = false; }
        };
        tray.on('click', popup); tray.on('right-click', popup);
      } else tray.on('double-click', show);
      await updateTray();
    }
    catch (e) { core.log('warning', `托盘初始化失败：${e.message}`); }
  }
  if (testing) app.lumaTest = { menu: () => trayMenu, state, openedDirectory: () => lastOpenedDirectory };
  // Start before revealing the window so opening the app requires no extra action.
  if (store.state.autoStart) void executeAction('start').catch(e => core.log('error', e.message));
  if (!store.state.lightweightMode || !tray) await revealWindow();
  else if (process.platform === 'darwin') app.dock.hide();
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault();
    serialize(async () => {
      try { await systemProxy.disable(); await core.stop(); quitting = true; tray?.destroy(); app.quit(); }
      catch (e) { show(); dialog.showErrorBox('系统代理尚未恢复', `为避免网络中断，请关闭系统代理后再退出。${e.message}`); }
    });
  });
  process.on('SIGTERM', () => app.quit());
  process.on('SIGINT', () => app.quit());
  bootComplete = true;
}
