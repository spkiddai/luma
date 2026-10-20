import { test, expect, _electron as electron } from '@playwright/test';
import { rm } from 'node:fs/promises';
import { desktopFixture } from './fixture.mjs';

test('automatic startup reports a bad profile and recovers when a valid profile is selected', async () => {
  const { directory, store } = await desktopFixture('desk-startup-');
  const initialProfile = store.state.selectedProfile;
  const broken = await store.add({ name: '错误配置', content: 'proxies: [{ name: broken, type: nonexistent-protocol }]\nrules: [MATCH,DIRECT]' });
  store.state.selectedProfile = broken.id;
  store.state.version = 1; store.state.autoStart = false; // Older installs migrate to the new default.
  await store.save();
  const env = { ...process.env, LUMA_TEST_MODE: '1', LUMA_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL;
  const launch = process.env.LUMA_PACKAGED_APP ? { executablePath: process.env.LUMA_PACKAGED_APP, args: [], env } : { args: ['.'], env };
  let app;
  try {
    app = await electron.launch(launch);
    const page = await app.firstWindow();
    await expect(page.getByText('内核启动失败', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '重试启动', exact: true })).toBeVisible();
    const failed = await page.evaluate(() => window.luma.state());
    expect(failed.running).toBe(false); expect(failed.starting).toBe(false);
    expect(failed.coreError).toContain('内核配置校验失败');
    expect(failed.autoStart).toBe(true);
    await page.getByRole('navigation').getByRole('button', { name: '配置', exact: true }).click();
    await page.locator('.profile-card').filter({ hasText: '本地直连' }).getByRole('button', { name: '使用配置', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.luma.state().then(s => s.running))).toBe(true);
    const recovered = await page.evaluate(() => window.luma.state());
    expect(recovered.selectedProfile).toBe(initialProfile); expect(recovered.coreError).toBe('');
    await page.getByRole('navigation').getByRole('button', { name: '代理', exact: true }).click();
    await expect(page.getByRole('heading', { name: '节点选择', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '启动内核', exact: true })).toHaveCount(0);
  } finally { await app?.close(); await rm(directory, { recursive: true, force: true }); }
});
