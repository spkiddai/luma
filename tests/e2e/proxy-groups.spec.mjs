import { test, expect, _electron as electron } from '@playwright/test';
import { desktopFixture } from './fixture.mjs';
import { rm, mkdir } from 'node:fs/promises';
import YAML from 'yaml';

const names = ['🚀 节点选择', '♻️ 自动选择', '🌍 国外媒体', '📲 电报信息', '💬 OpenAi', '💎 Gemini', '💡 Claude', 'Ⓜ️ 微软服务', '🍎 苹果服务', '📢 谷歌FCM', '🎯 全球直连', '🛑 全球拦截', '🐟 漏网之鱼'];
const config = YAML.stringify({
  proxies: [],
  'proxy-groups': [
    ...names.map((name, i) => ({ name, type: 'select', proxies: i === 0 ? ['♻️ 自动选择', 'DIRECT', 'REJECT'] : i === 1 ? ['DIRECT', 'REJECT'] : ['🚀 节点选择', 'DIRECT', 'REJECT'] })),
    { name: '隐藏策略', type: 'select', hidden: true, proxies: ['DIRECT'] },
  ],
  rules: ['MATCH,🚀 节点选择'],
});

test('proxy groups collapse, search, select and retain their state with the real core', async () => {
  const { directory } = await desktopFixture('desk-accordion-');
  const env = { ...process.env, LUMA_TEST_MODE: '1', LUMA_TEST_TRAY: '1', LUMA_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL;
  const launch = process.env.LUMA_PACKAGED_APP ? { executablePath: process.env.LUMA_PACKAGED_APP, args: [], env } : { args: ['.'], env };
  let app;
  try {
    app = await electron.launch(launch);
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await expect(page.getByRole('heading', { name: '网络，尽在掌握。' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.luma.state().then(s => s.running))).toBe(true);
    await page.evaluate(async ({ config }) => {
      const result = await window.luma.importProfile({ name: '折叠代理组测试', content: config });
      await window.luma.selectProfile({ id: result.profiles.at(-1).id });
      await window.luma.reveal({ page: 'proxies' });
    }, { config });
    const groups = page.locator('.proxy-group');
    const toggle = groups.first().getByRole('button', { name: names[0], exact: true });
    await expect(groups).toHaveCount(13);
    await expect(page.locator('.proxy-group-name')).toHaveText(names);
    expect(await app.evaluate(({ app }) => app.lumaTest.menu().getMenuItemById('proxies').submenu.items.filter(item => item.id?.startsWith('group:')).map(item => item.label))).toEqual(names);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.node-card')).toHaveCount(0);
    await expect(groups.first().locator('.proxy-current')).toHaveText('♻️ 自动选择');
    await expect(groups.first().locator('.proxy-group-count')).toHaveText('3');
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ animations: 'disabled', path: 'artifacts/proxy-groups-collapsed.png' });
    await page.locator('.proxy-group-list').screenshot({ animations: 'disabled', path: 'artifacts/proxy-groups-list.png' });

    await toggle.focus(); await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(groups.first().locator('.node-card')).toHaveCount(3);
    await groups.first().locator('.node-card').filter({ hasText: 'REJECT' }).click();
    await expect(groups.first().locator('.proxy-current')).toHaveText('REJECT');
    await expect(groups.first().locator('.node-card.chosen')).toContainText('REJECT');
    await expect.poll(() => app.evaluate(({ app }) => app.lumaTest.menu().getMenuItemById('proxy:🚀 节点选择:REJECT').checked)).toBe(true);
    await page.locator('.page-scroll').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ animations: 'disabled', path: 'artifacts/proxy-groups-expanded.png' });
    await page.getByRole('navigation').getByRole('button', { name: '概览', exact: true }).click();
    await page.getByRole('navigation').getByRole('button', { name: '代理', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.reload();
    await page.getByRole('navigation').getByRole('button', { name: '代理', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(groups.nth(1).locator('.proxy-group-toggle')).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: '全部展开', exact: true }).click();
    await expect(page.locator('.proxy-group-panel')).toHaveCount(13);
    await page.getByRole('button', { name: '全部收起', exact: true }).click();
    await expect(page.locator('.proxy-group-panel')).toHaveCount(0);
    await page.getByLabel('搜索节点', { exact: true }).fill('REJECT');
    await expect(page.locator('.proxy-group-panel')).toHaveCount(13);
    await expect(groups.first().locator('.node-card')).toHaveCount(1);
    await expect(groups.first().locator('.node-card')).toContainText('REJECT');
    await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.getByLabel('搜索节点', { exact: true }).fill('微软服务');
    await expect(groups).toHaveCount(1);
    await expect(groups.first().locator('.node-card')).toHaveCount(3);
    await page.getByLabel('搜索节点', { exact: true }).fill('no-such-node');
    await expect(page.getByRole('status')).toContainText('没有匹配');
    await page.getByLabel('搜索节点', { exact: true }).fill('');
    await expect(groups).toHaveCount(13);
    await expect(page.locator('.proxy-group-panel')).toHaveCount(0);

    await page.getByRole('group', { name: '出站模式', exact: true }).getByRole('button', { name: '全局', exact: true }).click();
    await expect(page.getByRole('button', { name: 'GLOBAL', exact: true })).toBeVisible();
    await page.getByRole('group', { name: '出站模式', exact: true }).getByRole('button', { name: '规则', exact: true }).click();
    await expect(groups).toHaveCount(13);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(980, 690));
    await page.screenshot({ animations: 'disabled', path: 'artifacts/proxy-groups-compact.png' });
    await expect(groups.first()).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await app?.close(); await rm(directory, { recursive: true, force: true }); }
});
