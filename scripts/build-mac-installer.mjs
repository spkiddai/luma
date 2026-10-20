import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

if (process.platform !== 'darwin') throw new Error('macOS 安装包需要在 Mac 上构建');
const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const app = path.resolve(process.argv[2] || path.join(root, 'release/mac-arm64/Luma.app'));
const { stdout } = await execute('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Contents/Info.plist')]);
const info = JSON.parse(stdout);
if (info.CFBundleIdentifier !== pkg.build.appId || info.CFBundleShortVersionString !== pkg.version) throw new Error('应用标识或版本不匹配，请先构建当前版本的 Mac 应用');
let architecture;
for (const executable of ['Contents/MacOS/Luma', 'Contents/Resources/core/mihomo']) {
  const { stdout: architectures } = await execute('/usr/bin/lipo', ['-archs', path.join(app, executable)]);
  const value = architectures.trim();
  if (!['arm64', 'x86_64'].includes(value) || (architecture && architecture !== value)) throw new Error('App and core architectures must match: arm64 or x86_64');
  architecture = value;
}

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const plist = content => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${content}</plist>\n`;
const work = await mkdtemp(path.join(tmpdir(), 'luma-proxy-installer-'));
const outputDirectory = path.join(root, 'release', pkg.version);
const output = path.join(outputDirectory, `Luma-${pkg.version}-${architecture === 'arm64' ? 'arm64' : 'x64'}.pkg`);
try {
  const payload = path.join(work, 'payload');
  const resources = path.join(work, 'resources');
  await mkdir(payload); await mkdir(resources); await mkdir(outputDirectory, { recursive: true });
  await execute('/usr/bin/ditto', [app, path.join(payload, 'Luma.app')]);
  // Disable relocation so other release/workspace copies cannot redirect installation.
  const components = path.join(work, 'components.plist');
  await writeFile(components, plist(`<array><dict>
    <key>RootRelativeBundlePath</key><string>Luma.app</string>
    <key>BundleIsRelocatable</key><false/>
    <key>BundleIsVersionChecked</key><true/>
    <key>BundleHasStrictIdentifier</key><true/>
    <key>BundleOverwriteAction</key><string>upgrade</string>
  </dict></array>`));
  const component = path.join(work, 'Luma.pkg');
  await execute('/usr/bin/pkgbuild', ['--root', payload, '--component-plist', components, '--identifier', `${pkg.build.appId}.pkg`, '--version', pkg.version, '--install-location', '/Applications', '--ownership', 'recommended', component], { timeout: 120000 });

  const requirements = path.join(work, 'requirements.plist');
  await writeFile(requirements, plist(`<dict><key>arch</key><array><string>${architecture}</string></array><key>os</key><array><string>${escape(info.LSMinimumSystemVersion || '13.0')}</string></array></dict>`));
  const distribution = path.join(work, 'Distribution.xml');
  await execute('/usr/bin/productbuild', ['--synthesize', '--product', requirements, '--package', component, distribution]);
  let xml = await readFile(distribution, 'utf8');
  xml = xml.replace(/<title>[^<]*<\/title>/, '');
  xml = xml.replace(/(<installer-gui-script\b[^>]*>)/, `$1\n<title>Luma ${escape(pkg.version)}</title>\n<welcome file="welcome.html"/>\n<conclusion file="conclusion.html"/>\n<domains enable_localSystem="true" enable_currentUserHome="false" enable_anywhere="false"/>`);
  await writeFile(distribution, xml);
  const html = body => `<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8"><style>body{font:14px -apple-system,sans-serif;line-height:1.8;padding:12px;color:#263f34}h1{font-size:22px}code{font-size:12px}</style><body>${body}</body></html>`;
  await writeFile(path.join(resources, 'welcome.html'), html(`<h1>安装 Luma ${escape(pkg.version)}</h1><p>适用于 ${architecture === 'arm64' ? 'Apple Silicon (M)' : 'Intel'} Mac。</p><p>点击“继续”并完成安装，应用会自动放入“应用程序”文件夹，无需手动拖拽。</p><p>安装位置：<code>/Applications/Luma.app</code></p><p>安装前请退出正在运行的 Luma。本地订阅和配置将保留。</p>`));
  await writeFile(path.join(resources, 'conclusion.html'), html('<h1>Luma 已安装</h1><p>可以从“应用程序”或 Spotlight 搜索 Luma 打开。</p><p>安装程序不会自动启动应用或开启系统代理。</p>'));
  await execute('/usr/bin/productbuild', ['--distribution', distribution, '--package-path', work, '--resources', resources, output], { timeout: 120000 });
  const checksum = createHash('sha256').update(await readFile(output)).digest('hex');
  await writeFile(`${output}.sha256`, `${checksum}  ${path.basename(output)}\n`);
  console.log(`已生成安装包：${output}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
