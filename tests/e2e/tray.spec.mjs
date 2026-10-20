import { test, expect, _electron as electron } from '@playwright/test';
import { desktopFixture } from './fixture.mjs';
import { rm } from 'node:fs/promises';

test('native tray controls mode/nodes and keeps the core alive in lightweight mode', async () => {
  const { directory } = await desktopFixture('desk-tray-');
  const env = { ...process.env, LUMA_TEST_MODE: '1', LUMA_TEST_TRAY: '1', LUMA_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL;
  const launch = process.env.LUMA_PACKAGED_APP ? { executablePath: process.env.LUMA_PACKAGED_APP, args: [], env } : { args: ['.'], env };
  let app;
  const click = id => app.evaluate(({ app }, id) => {
    const item = app.lumaTest.menu().getMenuItemById(id);
    if (!item?.enabled) throw new Error(`Menu item unavailable: ${id}`);
    item.click();
  }, id);
  const state = () => app.evaluate(({ app }) => app.lumaTest?.state());
  const checked = id => app.evaluate(({ app }, id) => Boolean(app.lumaTest.menu().getMenuItemById(id)?.checked), id);
  try {
    app = await electron.launch(launch);
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: '网络，尽在掌握。' })).toBeVisible();
    await expect.poll(async () => (await state()).running).toBe(true);
    await click('mode:global'); await expect.poll(() => checked('mode:global')).toBe(true);
    await expect.poll(async () => (await state()).mode).toBe('global');
    await click('mode:rule'); await expect.poll(() => checked('mode:rule')).toBe(true);
    await click('proxy:节点选择:REJECT'); await expect.poll(() => checked('proxy:节点选择:REJECT')).toBe(true);
    await click('proxy:节点选择:DIRECT'); await expect.poll(() => checked('proxy:节点选择:DIRECT')).toBe(true);
    await click('lightweight');
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0);
    await expect.poll(() => checked('lightweight')).toBe(true);
    expect((await state()).running).toBe(true);
    expect((await state()).lightweightMode).toBe(true);
    const reopened = app.waitForEvent('window'); await click('dashboard'); const restored = await reopened;
    await expect(restored.getByRole('heading', { name: '网络，尽在掌握。' })).toBeVisible();
    await expect.poll(() => checked('lightweight')).toBe(false);
    await click('manage-profiles'); await expect(restored.getByRole('heading', { name: '你的配置，一处管理。' })).toBeVisible();
    await click('import-profile'); await expect(restored.getByRole('dialog')).toBeVisible();
    await restored.getByRole('button', { name: '取消', exact: true }).click();
    await click('lightweight'); await expect.poll(() => checked('lightweight')).toBe(true);
    await app.close(); app = await electron.launch(launch);
    await expect.poll(async () => (await state())?.lightweightMode).toBe(true);
    expect(app.windows()).toHaveLength(0);
    const secondWindow = app.waitForEvent('window'); await click('dashboard'); const second = await secondWindow;
    await expect(second.getByRole('heading', { name: '网络，尽在掌握。' })).toBeVisible();
    await expect.poll(async () => (await state()).lightweightMode).toBe(false);
    await expect.poll(async () => (await state()).running).toBe(true);
  } finally { await app?.close(); await rm(directory, { recursive: true, force: true }); }
});
