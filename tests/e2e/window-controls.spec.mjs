import { test, expect, _electron as electron } from '@playwright/test';
import { desktopFixture } from './fixture.mjs';
import { rm } from 'node:fs/promises';

test('macOS controls stay visible and operate the native window', async () => {
  test.skip(process.platform !== 'darwin', 'Mac-specific title-bar controls');
  const { directory } = await desktopFixture('desk-window-controls-');
  const env = { ...process.env, LUMA_TEST_MODE: '1', LUMA_TEST_TRAY: '1', LUMA_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL;
  const launch = process.env.LUMA_PACKAGED_APP ? { executablePath: process.env.LUMA_PACKAGED_APP, args: [], env } : { args: ['.'], env };
  let app;
  try {
    app = await electron.launch(launch); const page = await app.firstWindow();
    const controls = page.getByRole('group', { name: '窗口控制' });
    await expect(controls).toBeVisible();
    const location = await controls.boundingBox();
    expect(location.x).toBeGreaterThanOrEqual(12); expect(location.x).toBeLessThanOrEqual(20);
    expect(location.x + location.width).toBeLessThan(85);
    expect(location.y).toBeLessThan(40);
    await page.getByRole('button', { name: '放大或还原窗口', exact: true }).click();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
    await page.getByRole('button', { name: '放大或还原窗口', exact: true }).click();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false);
    await page.getByRole('button', { name: '最小化窗口', exact: true }).click();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true);
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.restore(); window.show(); });
    await expect(controls).toBeVisible();
    await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
    await app.evaluate(({ app }) => app.lumaTest.menu().getMenuItemById('dashboard').click());
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
    await expect(controls).toBeVisible();
    await page.screenshot({ path: 'artifacts/window-controls.png' });
    await page.locator('.mac-drag').screenshot({ path: 'artifacts/window-controls-detail.png' });
  } finally { await app?.close(); await rm(directory, { recursive: true, force: true }); }
});
