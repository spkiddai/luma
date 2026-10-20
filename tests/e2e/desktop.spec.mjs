import { test, expect, _electron as electron } from '@playwright/test';
import { desktopFixture } from './fixture.mjs';
import { rm, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { availablePort } from '../../electron/core.mjs';

const config = `proxies: []\nproxy-groups:\n  - name: 测试策略\n    type: select\n    proxies: [DIRECT, REJECT]\nrules:\n  - DOMAIN-SUFFIX,example.com,DIRECT\n  - GEOSITE,cn,DIRECT\n  - GEOIP,CN,DIRECT\n  - IP-ASN,4134,DIRECT\n  - MATCH,测试策略\n`;

test('desktop workflows use the real mihomo core and persist profiles', async () => {
  const { directory, port } = await desktopFixture('desk-desktop-');
  const env = { ...process.env, LUMA_TEST_MODE: '1', LUMA_DATA_DIR: directory };
  const launchOptions = process.env.LUMA_PACKAGED_APP ? { executablePath: process.env.LUMA_PACKAGED_APP, args: [], env } : { args: ['.'], env };
  delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL;
  let app, request, responseVersion = 1, remoteRequests = 0;
  const source = http.createServer((req, res) => {
    if (req.url.startsWith('/subscription')) { remoteRequests++; res.setHeader('Content-Type', 'text/yaml'); res.end(config.replace('测试策略', `订阅策略${responseVersion}`).replace('MATCH,测试策略', `MATCH,订阅策略${responseVersion}`)); }
    else if (req.url === '/stream') { const timer = setInterval(() => res.write(Buffer.alloc(64 * 1024, 'a')), 100); req.on('close', () => clearInterval(timer)); }
    else res.end('local-origin');
  });
  await new Promise(r => source.listen(0, '127.0.0.1', r));
  try {
    app = await electron.launch(launchOptions);
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await expect(page.getByRole('heading', { name: '网络，尽在掌握。' })).toBeVisible();
    await expect(page.getByRole('button', { name: '停止内核', exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('内核正在运行', { exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: '系统代理' })).not.toBeChecked();
    await expect(page.locator('.metric-number').nth(3)).not.toContainText('NaN');
    await page.getByRole('button', { name: '全局', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.luma.state().then(s => s.mode))).toBe('global');
    await page.locator('.segmented').getByRole('button', { name: '规则', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.luma.state().then(s => s.mode))).toBe('rule');
    request = http.get({ host: '127.0.0.1', port, headers: { Host: `127.0.0.1:${source.address().port}` }, path: `http://127.0.0.1:${source.address().port}/stream` }, res => res.resume());
    await expect.poll(() => page.locator('.metric-number').nth(2).innerText()).toContain('1');
    await expect.poll(() => page.evaluate(() => window.luma.stats().then(s => s.downloadTotal))).toBeGreaterThan(100000);
    await expect.poll(() => page.evaluate(() => window.luma.stats().then(s => s.memory))).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.luma.stats().then(s => s.download))).toBeGreaterThan(0);
    await expect(page.locator('.metric-number').nth(3)).toContainText('MB');
    await page.locator('.page-scroll').evaluate(el => { el.scrollTop = 0; });
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/overview.png' });
    request.destroy(); request = null;

    await page.getByRole('navigation').getByRole('button', { name: '代理', exact: true }).click();
    await expect(page.getByRole('heading', { name: '节点选择' })).toBeVisible();
    await page.getByRole('button', { name: '节点选择', exact: true }).click();
    await page.locator('.node-card').filter({ hasText: 'REJECT' }).click();
    await expect(page.locator('.node-card.chosen')).toContainText('REJECT');
    await page.locator('.node-card').filter({ hasText: 'DIRECT' }).click();
    await expect(page.locator('.node-card.chosen')).toContainText('DIRECT');

    await page.getByRole('navigation').getByRole('button', { name: '配置', exact: true }).click();
    await page.getByRole('button', { name: '导入配置', exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: 'YAML 内容' }).click();
    await modal.getByLabel('配置名称').fill('本地测试配置');
    await modal.getByLabel('YAML 配置').fill(config);
    await modal.getByRole('button', { name: '导入配置', exact: true }).click();
    await expect(modal).not.toBeVisible();
    for (const file of ['geoip.metadb', 'geosite.dat', 'ASN.mmdb']) await access(path.join(directory, file));
    const localCard = page.locator('.profile-card').filter({ hasText: '本地测试配置' });
    await localCard.getByRole('button', { name: '使用配置' }).click();
    await expect(localCard.getByText('当前配置')).toBeVisible();
    await localCard.getByRole('button', { name: '编辑配置' }).click();
    await modal.getByLabel('YAML 配置').fill('mode: rule\nmode: global');
    await modal.getByRole('button', { name: '保存配置' }).click();
    await expect(modal.getByRole('alert')).toContainText('YAML 格式无效');
    await modal.getByLabel('YAML 配置').fill(config);
    await modal.getByRole('button', { name: '保存配置' }).click();
    await expect(modal).not.toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: '规则', exact: true }).click();
    await expect(page.getByRole('cell', { name: 'example.com', exact: true })).toBeVisible();
    await page.getByLabel('搜索规则').fill('not-found');
    await expect(page.getByRole('heading', { name: '没有匹配的规则' })).toBeVisible();

    await page.getByRole('navigation').getByRole('button', { name: '配置', exact: true }).click();
    await page.getByRole('button', { name: '导入配置', exact: true }).click();
    await modal.getByLabel('配置名称').fill('远程测试订阅');
    await modal.getByLabel('订阅地址').fill(`http://127.0.0.1:${source.address().port}/subscription?token=test-only`);
    await modal.getByRole('button', { name: '导入配置', exact: true }).click();
    await expect(modal).not.toBeVisible();
    const remoteCard = page.locator('.profile-card').filter({ hasText: '远程测试订阅' });
    await remoteCard.getByRole('button', { name: '使用配置' }).click();
    await expect(remoteCard.getByText('当前配置')).toBeVisible();
    responseVersion = 2;
    await remoteCard.getByRole('button', { name: '更新 远程测试订阅' }).click();
    await expect.poll(() => remoteRequests).toBe(2);
    await page.getByRole('navigation').getByRole('button', { name: '代理', exact: true }).click();
    await expect(page.getByRole('heading', { name: '订阅策略2' })).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: '日志', exact: true }).click();
    await expect(page.locator('.log-line').first()).toBeVisible();
    await expect(page.getByText('YAML 格式无效')).not.toBeVisible();
    await page.getByRole('button', { name: '停止内核', exact: true }).click();
    await expect(page.getByRole('button', { name: '恢复运行', exact: true })).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByLabel('代理端口', { exact: true })).toBeEnabled();
    await page.getByLabel('代理端口', { exact: true }).fill(String(await availablePort()));
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect(errors).toEqual([]);
    await app.close(); app = await electron.launch(launchOptions);
    const restored = await app.firstWindow();
    await expect(restored.getByRole('heading', { name: '网络，尽在掌握。' })).toBeVisible();
    const persisted = await restored.evaluate(() => window.luma.state());
    expect(persisted.profiles).toHaveLength(3);
    expect(persisted.profiles.find(p => p.id === persisted.selectedProfile).name).toBe('远程测试订阅');
    await expect.poll(() => restored.evaluate(() => window.luma.state().then(s => s.running))).toBe(true);
    await expect(restored.getByRole('button', { name: '停止内核', exact: true })).toBeVisible();
    await app.close(); app = null;
    await expect.poll(() => availablePort(persisted.port).catch(() => 0)).toBe(persisted.port);
  } finally {
    request?.destroy();
    await app?.close();
    source.closeAllConnections(); await new Promise(r => source.close(r));
    await rm(directory, { recursive: true, force: true });
  }
});
