import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../electron/store.mjs';
import { DEFAULT_PROFILE } from '../electron/config.mjs';

test('profile persistence protects active configuration, rejects traversal and hides subscription tokens', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'desk-store-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await new Store(directory).init();
  const active = store.state.selectedProfile;
  await assert.rejects(store.remove(active), /切换/);
  assert.throws(() => store.profilePath('../../credentials'));
  const profile = await store.add({ name: '订阅', content: DEFAULT_PROFILE, url: 'https://example.com/config?token=private' });
  const publicProfile = store.publicState().profiles.find(p => p.id === profile.id);
  assert.equal(publicProfile.source, 'example.com'); assert.equal(publicProfile.url, undefined);
  if (process.platform !== 'win32') assert.equal((await stat(store.profilePath(profile.id))).mode & 0o777, 0o600);
  const restored = await new Store(directory).init();
  assert.equal(await restored.content(profile.id), DEFAULT_PROFILE);
  await restored.remove(profile.id); assert.equal(restored.state.profiles.length, 1);
});

test('new startup settings default on, migrate older installs and preserve later user choices', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'desk-startup-migration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await new Store(directory).init();
  const selected = store.state.selectedProfile;
  assert.equal(store.state.autoStart, true); assert.equal(store.state.allowLan, false);
  store.state.version = 1; store.state.autoStart = false; store.state.port = 18091;
  await store.save();
  const migrated = await new Store(directory).init();
  assert.equal(migrated.state.autoStart, true);
  assert.equal(migrated.state.selectedProfile, selected);
  assert.equal(migrated.state.port, 18091);
  assert.equal(await migrated.content(), DEFAULT_PROFILE);
  migrated.state.autoStart = false; await migrated.save();
  assert.equal((await new Store(directory).init()).state.autoStart, false);
});

test('removing application proxy clears saved entries and preserves profiles and network preferences', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'desk-remove-app-proxy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await new Store(directory).init();
  Object.assign(store.state, { version: 2, autoStart: false, launchAtLogin: true, allowLan: true, port: 18091, mode: 'global', applicationProxies: [{ id: 'old-entry', name: 'Codex', mode: 'proxy' }] });
  await store.save();
  const { applicationProxies, ...preferences } = store.state;
  const migrated = await new Store(directory).init();
  assert.deepEqual(migrated.state, { ...preferences, version: 3 });
  assert.equal(await migrated.content(), DEFAULT_PROFILE);
  const saved = JSON.parse(await readFile(migrated.file, 'utf8'));
  assert.equal(Object.hasOwn(saved, 'applicationProxies'), false);
  assert.deepEqual((await new Store(directory).init()).state, migrated.state);
});
