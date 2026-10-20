import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePreferences } from '../electron/preferences.mjs';
import { availablePort } from '../electron/core.mjs';

test('live port/LAN changes update the running core and system proxy together', async () => {
  const calls = [];
  const store = { state: { port: 17890, allowLan: false, autoStart: true, launchAtLogin: false }, content: async () => 'config', save: async () => calls.push('save') };
  const core = { running: true, apply: async () => calls.push(['apply', store.state.port, store.state.allowLan]) };
  const systemProxy = { enabled: true, disable: async () => calls.push('disable'), enable: async port => calls.push(['enable', port]) };
  const port = await availablePort();
  await updatePreferences({ store, core, systemProxy }, { port, allowLan: true });
  assert.deepEqual(calls, ['disable', ['apply', port, true], ['enable', port], 'save']);
  assert.equal(store.state.port, port);
});

test('failed network changes restore the saved port and original proxy endpoint', async () => {
  const calls = [], port = await availablePort();
  const store = { state: { port: 17890, allowLan: false }, content: async () => 'config', save: async () => {} };
  let attempts = 0;
  const core = { running: true, apply: async () => { if (++attempts === 1) throw new Error('reload failed'); calls.push(store.state.port); } };
  const systemProxy = { enabled: true, disable: async () => {}, enable: async endpoint => calls.push(endpoint) };
  await assert.rejects(updatePreferences({ store, core, systemProxy }, { port }), /reload failed/);
  assert.equal(store.state.port, 17890); assert.deepEqual(calls, [17890, 17890]);
  await assert.rejects(updatePreferences({ store, core, systemProxy }, { autoStart: 'true' }), /无效/);
});
