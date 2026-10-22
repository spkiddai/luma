import { mkdir, copyFile, cp, writeFile, readFile, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { buildDownload } from './build-download.mjs';
const run = (file, args) => execFileSync(file, args, { stdio: 'inherit' });
run(process.execPath, ['build/luma/download-core.mjs']);
run(process.execPath, ['build/luma/download-geodata.mjs']);
const triples = { 'darwin-arm64': 'aarch64-apple-darwin', 'darwin-x64': 'x86_64-apple-darwin', 'win32-x64': 'x86_64-pc-windows-msvc', 'linux-x64': 'x86_64-unknown-linux-gnu' };
const triple = triples[`${process.platform}-${process.arch}`];
if (!triple) throw new Error('Unsupported build platform');
const suffix = process.platform === 'win32' ? '.exe' : '';
const os = { darwin: 'mac', win32: 'win', linux: 'linux' }[process.platform];
await mkdir('src-tauri/sidecar', { recursive: true });
await mkdir('src-tauri/resources', { recursive: true });
const binary = `src-tauri/sidecar/luma-mihomo-${triple}${suffix}`;
await copyFile(`resources/core/${os}-${process.arch}/mihomo${suffix}`, binary);
await chmod(binary, 0o755);
for (const [source, destination] of Object.entries({ 'geoip.metadb': 'Country.mmdb', 'geoip.dat': 'geoip.dat', 'geosite.dat': 'geosite.dat', 'ASN.mmdb': 'ASN.mmdb' })) {
  await copyFile(`resources/geodata/${source}`, `src-tauri/resources/${destination}`);
}
await cp('resources/licenses', 'src-tauri/resources/licenses', { recursive: true });
await copyFile('LICENSE', 'src-tauri/resources/licenses/Luma-LICENSE');
await copyFile('THIRD_PARTY_NOTICES.md', 'src-tauri/resources/licenses/THIRD_PARTY_NOTICES.md');
// Corresponding source accompanies the pinned precompiled core.
await mkdir('src-tauri/resources/source', { recursive: true });
const commit = '88dcbf7f1614a67c3b36b848ee3592dfa92ada36';
await writeFile('src-tauri/resources/source/mihomo-v1.19.32.tar.gz', await buildDownload(`https://api.github.com/repos/MetaCubeX/mihomo/tarball/${commit}`));
await copyFile(`resources/core/${os}-${process.arch}/version.json`, 'src-tauri/resources/core-version.json');
await copyFile('resources/geodata/manifest.json', 'src-tauri/resources/geodata-manifest.json');
if (process.platform === 'win32') run('cmd.exe', ['/d', '/s', '/c', 'pnpm exec tauri icon resources/icon.png --output src-tauri/icons']);
else run('pnpm', ['exec', 'tauri', 'icon', 'resources/icon.png', '--output', 'src-tauri/icons']);
for (const name of ['tray-icon.ico','tray-icon-sys.ico','tray-icon-tun.ico','tray-icon-mono.ico','tray-icon-sys-mono-new.ico','tray-icon-tun-mono-new.ico']) {
  await copyFile('src-tauri/icons/icon.ico', path.join('src-tauri/icons', name));
}
console.log(`Prepared bundled core, geodata, licenses and icons for ${triple}`);
