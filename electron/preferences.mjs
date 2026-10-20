import { availablePort } from './core.mjs';
import { validPort } from './config.mjs';

export async function updatePreferences({ store, core, systemProxy, setLoginItemSettings }, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('无效设置');
  const previous = { ...store.state };
  const next = { ...previous };
  for (const key of Object.keys(data)) {
    if (!['port', 'allowLan', 'autoStart', 'launchAtLogin'].includes(key)) throw new Error('未知设置');
    if (key === 'port') validPort(data[key]);
    else if (typeof data[key] !== 'boolean') throw new Error('无效开关设置');
    next[key] = data[key];
  }
  const portChanged = next.port !== previous.port;
  const networkChanged = portChanged || next.allowLan !== previous.allowLan;
  const wasRunning = core.running, proxyEnabled = systemProxy.enabled;
  if (wasRunning && next.port !== previous.port) await availablePort(next.port);
  store.state = next;
  try {
    if (networkChanged && wasRunning) {
      if (portChanged && proxyEnabled) await systemProxy.disable();
      await core.apply(await store.content());
      if (portChanged && proxyEnabled) await systemProxy.enable(next.port);
    }
    if (next.launchAtLogin !== previous.launchAtLogin) setLoginItemSettings({ openAtLogin: next.launchAtLogin });
    await store.save();
  } catch (error) {
    store.state = previous;
    const failures = [];
    if (networkChanged && wasRunning) {
      try { await core.apply(await store.content()); } catch (e) { failures.push(e.message); }
      if (portChanged && proxyEnabled) {
        try { await systemProxy.disable(); await systemProxy.enable(previous.port); } catch (e) { failures.push(e.message); }
      }
    }
    if (next.launchAtLogin !== previous.launchAtLogin) {
      try { setLoginItemSettings({ openAtLogin: previous.launchAtLogin }); } catch (e) { failures.push(e.message); }
    }
    try { await store.save(); } catch (e) { failures.push(e.message); }
    if (failures.length) throw new Error(`${error.message}；恢复之前的设置失败：${failures.join('；')}`);
    throw error;
  }
}
