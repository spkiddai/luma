import sharp from 'sharp';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="g" x2=".9" y2="1"><stop stop-color="#43866a"/><stop offset="1" stop-color="#225a40"/></linearGradient></defs><rect x="42" y="42" width="940" height="940" rx="220" fill="url(#g)"/><path d="M261 690V360l251 198 251-198v330" fill="none" stroke="#eaf4e9" stroke-width="61" stroke-linecap="round" stroke-linejoin="round"/><path d="M261 690l251-132 251 132" fill="none" stroke="#b7d5b8" stroke-width="32" stroke-linejoin="round"/><g fill="#edf7e9"><circle cx="261" cy="690" r="53"/><circle cx="512" cy="558" r="53"/><circle cx="763" cy="690" r="53"/></g></svg>`;
await writeFile('resources/icon.svg', logo);
await sharp(Buffer.from(logo)).resize(512).png().toFile('resources/icon.png');
const tray = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><path d="M7 32V10l15 13 15-13v22M7 32l15-9 15 9" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><g fill="#000"><circle cx="7" cy="32" r="3.5"/><circle cx="22" cy="23" r="3.5"/><circle cx="37" cy="32" r="3.5"/></g></svg>`;
await sharp(Buffer.from(tray)).resize(22).png().toFile('resources/tray.png');
await sharp(Buffer.from(tray)).resize(44).png().toFile('resources/tray@2x.png');
if (process.platform === 'darwin') {
  const dir = 'resources/app.iconset'; await mkdir(dir, { recursive: true });
  for (const size of [16,32,128,256,512]) {
    await sharp(Buffer.from(logo)).resize(size).png().toFile(`${dir}/icon_${size}x${size}.png`);
    await sharp(Buffer.from(logo)).resize(size * 2).png().toFile(`${dir}/icon_${size}x${size}@2x.png`);
  }
  execFileSync('iconutil', ['-c', 'icns', dir, '-o', 'resources/icon.icns']);
  await rm(dir, { recursive: true });
}
console.log('App and tray icons created.');
