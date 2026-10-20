import test from 'node:test';
import assert from 'node:assert/strict';
import { Core } from '../electron/core.mjs';

test('overview summaries do not retain connection records, while the connections page always refreshes', async () => {
  const core = new Core({ binary: '/unused/mihomo', directory: '/unused', store: {} });
  core.running = true; core.startedAt = Date.now();
  let calls = 0;
  core.request = async () => { calls++; return { uploadTotal: calls * 100, downloadTotal: calls * 200, connections: [{ id: String(calls), metadata: { host: 'private.example' } }] }; };
  let summary = await core.snapshot({ includeConnections: false });
  assert.equal(summary.connectionCount, 1); assert.deepEqual(summary.connections, []);
  assert.ok(!JSON.stringify(core.connectionSummary).includes('private.example'));
  core.traffic = { up: 25, down: 50 };
  summary = await core.snapshot({ includeConnections: false });
  assert.equal(calls, 1); assert.equal(summary.download, 50);
  core.connectionSummary.sampledAt -= 5001;
  await core.snapshot({ includeConnections: false }); assert.equal(calls, 2);
  const detail = await core.snapshot({ includeConnections: true });
  assert.equal(calls, 3); assert.equal(detail.connections[0].id, '3');
  await core.snapshot({ includeConnections: true }); assert.equal(calls, 4);
  core.running = false;
  assert.equal((await core.snapshot()).connectionCount, 0);
});
