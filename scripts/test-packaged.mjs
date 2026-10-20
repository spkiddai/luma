import { spawn } from 'node:child_process';
import path from 'node:path';
const binaries = { darwin: 'release/mac-arm64/Luma.app/Contents/MacOS/Luma', win32: 'release/win-unpacked/Luma.exe', linux: 'release/linux-unpacked/Luma' };
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], { stdio: 'inherit', env: { ...process.env, LUMA_PACKAGED_APP: process.env.LUMA_PACKAGED_APP || path.resolve(binaries[process.platform]) } });
child.on('exit', code => process.exit(code || 0));
