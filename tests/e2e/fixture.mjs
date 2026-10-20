import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../electron/store.mjs';
import { availablePort } from '../../electron/core.mjs';

export async function desktopFixture(prefix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const store = await new Store(directory).init();
  store.state.port = await availablePort();
  await store.save();
  return { directory, store, port: store.state.port };
}
