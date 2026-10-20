import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

// Build credentials are read only for api.github.com and sent through stdin,
// so subprocess errors cannot print them as command arguments.
export async function buildDownload(url, maxBuffer = 150 * 1024 * 1024) {
  const parsed = new URL(url);
  let config = '';
  if (parsed.hostname === 'api.github.com') {
    const token = process.env.GITHUB_TOKEN || (process.env.LUMA_GITHUB_TOKEN_FILE ? await readFile(process.env.LUMA_GITHUB_TOKEN_FILE, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; }) : '');
    if (token) {
      if (!/^[\w.-]+$/.test(token.trim())) throw new Error('Invalid GitHub build token format');
      config = `header = "Authorization: Bearer ${token.trim()}"\n`;
    }
  }
  const pending = promisify(execFile)('curl', ['--config', '-', '--http1.1', '--fail', '--silent', '--show-error', '--location', '--retry', '3', '--retry-all-errors', '--connect-timeout', '20', '--max-time', '180', '--user-agent', 'Luma-build', url], { encoding: 'buffer', maxBuffer, timeout: 240000 });
  pending.child.stdin.end(config);
  return (await pending).stdout;
}
