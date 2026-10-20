const { contextBridge, ipcRenderer } = require('electron');
const actions = ['state', 'stats', 'logs', 'start', 'stop', 'restart', 'proxies', 'selectProxy', 'delay', 'rules', 'closeConnection', 'setMode', 'setSystemProxy', 'importFile', 'importProfile', 'selectProfile', 'updateProfile', 'deleteProfile', 'profileContent', 'saveProfile', 'renameProfile', 'settings', 'openData', 'openDirectory', 'openDocs', 'window', 'quit', 'reveal', 'setLightweight'];
const api = {};
for (const action of actions) api[action] = async (data) => {
  const result = await ipcRenderer.invoke('luma:action', action, data);
  if (!result.ok) throw new Error(result.error);
  return result.data;
};
api.initialNavigation = { page: process.argv.find(a => a.startsWith('--luma-page='))?.split('=')[1] || 'overview', importProfile: process.argv.includes('--luma-import-profile=1') };
api.onNavigate = callback => {
  const listener = (_event, navigation) => callback(navigation);
  ipcRenderer.on('luma:navigate', listener);
  return () => ipcRenderer.removeListener('luma:navigate', listener);
};
contextBridge.exposeInMainWorld('luma', Object.freeze(api));
