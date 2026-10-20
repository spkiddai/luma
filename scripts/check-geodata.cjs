const { readFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const path = require('node:path');

module.exports = async context => {
  const directory = path.join(context.packager.info.appDir, 'resources/geodata');
  try {
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
    const expected = new Set(['geoip.metadb', 'geoip.dat', 'geosite.dat', 'ASN.mmdb']);
    for (const entry of manifest.files) {
      if (!expected.delete(entry.file)) throw new Error('Unexpected geodata manifest entry');
      const data = await readFile(path.join(directory, entry.file));
      if (createHash('sha256').update(data).digest('hex') !== entry.sha256) throw new Error(`Invalid checksum: ${entry.file}`);
    }
    if (expected.size) throw new Error('Missing geodata files');
  } catch (error) {
    throw new Error(`内置地理数据库缺失或校验失败，请先运行 npm run geodata:download。${error.message}`);
  }
};
