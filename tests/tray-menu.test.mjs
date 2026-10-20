import test from 'node:test';
import assert from 'node:assert/strict';
import { trayMenuTemplate } from '../electron/tray-menu.mjs';

const state = { mode: 'rule', running: true, systemProxy: false, selectedProfile: 'a', profiles: [{ id: 'a', name: '本地配置', kind: 'local' }, { id: 'b', name: '远程订阅', kind: 'remote' }], autoStart: false, launchAtLogin: false };
const make = (overrides = {}, proxies = {}) => {
  const actions = [];
  const menu = trayMenuTemplate({ state: { ...state, ...overrides }, proxies, dispatch: (...args) => actions.push(args) });
  const find = id => { const visit = items => { for (const item of items) { if (item.id === id) return item; const result = item.submenu && visit(item.submenu); if (result) return result; } }; return visit(menu); };
  return { menu, find, actions };
};
test('tray keeps system proxy without application proxy or TUN', () => {
  const { menu, find } = make();
  assert.deepEqual(menu.filter(i => i.label).map(i => i.label), ['仪表板', '出站模式（规则）', '订阅', '代理', '系统代理', '轻量模式', '打开目录', '更多', '退出']);
  assert.equal(find('tun'), undefined); assert.equal(find('application-proxy'), undefined);
  assert.equal(find('update-profile').enabled, false); assert.equal(find('update-all-profiles').enabled, true);
});
test('mode/profile/proxy checkmarks and callbacks match the active state', () => {
  const { find, actions } = make({}, { group: { name: '节点选择', type: 'Selector', all: ['DIRECT', 'REJECT'], now: 'DIRECT' }, global: { name: 'GLOBAL', type: 'Selector', all: ['DIRECT'], now: 'DIRECT' }, hidden: { name: '隐藏', hidden: true, all: ['DIRECT'] } });
  assert.equal(find('mode:rule').checked, true); assert.equal(find('mode:global').checked, false);
  assert.equal(find('profile:a').checked, true); assert.equal(find('profile:b').checked, false);
  assert.equal(find('proxy:节点选择:DIRECT').checked, true); assert.equal(find('group:GLOBAL'), undefined); assert.equal(find('group:隐藏'), undefined);
  find('mode:global').click(); find('profile:b').click(); find('proxy:节点选择:REJECT').click();
  assert.deepEqual(actions, [['setMode', { mode: 'global' }], ['selectProfile', { id: 'b' }], ['selectProxy', { group: '节点选择', name: 'REJECT' }]]);
});
test('stopped core disables system proxy and displays stopped state', () => {
  const { find } = make({ running: false });
  assert.equal(find('system-proxy').enabled, false); assert.equal(find('restart-core').enabled, false);
  assert.equal(find('proxies').submenu[0].label, '内核未启动'); assert.equal(find('toggle-core').label, '恢复运行');
});
test('lightweight and navigation entries dispatch reversible window actions', () => {
  const { find, actions } = make({ lightweightMode: true, systemProxy: true });
  assert.equal(find('lightweight').checked, true); assert.equal(find('system-proxy').checked, true);
  find('lightweight').click(); find('dashboard').click(); find('import-profile').click();
  assert.deepEqual(actions, [['setLightweight', { enabled: false }], ['reveal', { page: 'overview', importProfile: false }], ['reveal', { page: 'profiles', importProfile: true }]]);
});
