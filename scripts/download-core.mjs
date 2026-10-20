import { mkdir, writeFile, rename, chmod, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const version = 'v1.19.32';
const platform = process.env.CORE_PLATFORM || process.platform;
const arch = process.env.CORE_ARCH || process.arch;
const targets = { 'darwin-arm64': 'darwin-arm64', 'darwin-x64': 'darwin-amd64-compatible', 'win32-x64': 'windows-amd64-compatible', 'linux-x64': 'linux-amd64-compatible', 'linux-arm64': 'linux-arm64' };
const target = targets[`${platform}-${arch}`];
if (!target) throw new Error(`Unsupported target: ${platform}-${arch}`);
const request = async (url) => {
  const { stdout } = await promisify(execFile)('curl', ['--http1.1', '--fail', '--silent', '--show-error', '--location', '--retry', '3', '--retry-all-errors', '--connect-timeout', '20', '--max-time', '180', '--user-agent', 'Luma-build', url], { encoding: 'buffer', maxBuffer: 150 * 1024 * 1024, timeout: 240000 });
  return new Response(stdout);
};
const release = await (await request(`https://api.github.com/repos/MetaCubeX/mihomo/releases/tags/${version}`)).json();
const filename = `mihomo-${target}-${version}.${platform === 'win32' ? 'zip' : 'gz'}`;
const asset = release.assets.find(a => a.name === filename);
if (!asset?.digest?.startsWith('sha256:')) throw new Error(`Missing asset or SHA-256 digest: ${filename}`);
console.log(`Downloading ${asset.name}`);
const archive = Buffer.from(await (await request(asset.browser_download_url)).arrayBuffer());
const digest = createHash('sha256').update(archive).digest('hex');
if (`sha256:${digest}` !== asset.digest) throw new Error('SHA-256 verification failed');
// electron-builder uses mac/win/linux in its ${os} resource paths.
const os = { darwin: 'mac', win32: 'win', linux: 'linux' }[platform];
const directory = path.resolve(`resources/core/${os}-${arch}`);
await mkdir(directory, { recursive: true });
const binaryPath = path.join(directory, platform === 'win32' ? 'mihomo.exe' : 'mihomo');
if (platform === 'win32') {
  const zip = path.join(directory, 'core.zip');
  await writeFile(zip, archive);
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip.replaceAll("'", "''")}' -DestinationPath '${directory.replaceAll("'", "''")}' -Force`]);
  const { readdir, unlink } = await import('node:fs/promises');
  const entry = (await readdir(directory)).find(n => n.endsWith('.exe'));
  if (!entry) throw new Error('No executable in core archive');
  if (entry !== 'mihomo.exe') await rename(path.join(directory, entry), binaryPath);
  await unlink(zip);
} else {
  await writeFile(`${binaryPath}.tmp`, gunzipSync(archive));
  await chmod(`${binaryPath}.tmp`, 0o755);
  await rename(`${binaryPath}.tmp`, binaryPath);
}
await writeFile(path.join(directory, 'version.json'), JSON.stringify({ version, asset: filename, sha256: digest, source: `https://github.com/MetaCubeX/mihomo/tree/${version}`, commit: '88dcbf7f1614a67c3b36b848ee3592dfa92ada36' }, null, 2));
await mkdir('resources/licenses', { recursive: true });
const license = await readFile('vendor/mihomo/LICENSE').catch(async () => Buffer.from(await (await request(`https://raw.githubusercontent.com/MetaCubeX/mihomo/${version}/LICENSE`)).text()));
await writeFile('resources/licenses/mihomo-LICENSE', license);
console.log(`Verified SHA-256. Ready: ${binaryPath}`);
