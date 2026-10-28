'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const files = ['Start-Windows.cmd','Run-Source-Windows.cmd','Build-Windows.cmd','README.md','.gitignore','.gitattributes','.nvmrc','package.json','package-lock.json','main.js','preload.js','engine.js','pdf.js','glyphs.js','index.html','styles.css','renderer.js','scripts/package-windows.js','tests/engine.test.js','tests/setup.test.js','tests/electron-test.js','tests/packaged-smoke.js','tests/fixtures/winning-page.rgb.deflate'];
for (const file of files) if (!fs.statSync(path.join(root, file)).isFile()) throw Error(`Missing file: ${file}`);
const checksumFile = path.join(root, 'node_modules', 'electron', 'checksums.json');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (fs.existsSync(checksumFile)) {
  const expected = JSON.parse(fs.readFileSync(checksumFile, 'utf8'))[`electron-v${metadata.devDependencies.electron}-win32-x64.zip`];
  if (!expected || !fs.readFileSync(path.join(root, 'Start-Windows.cmd'), 'utf8').includes(expected)) throw Error('Launcher checksum differs from the official Electron npm package.');
}
const out = path.join(root, 'release'); fs.mkdirSync(out, { recursive: true });
const version = metadata.version;
const archive = path.join(out, `Receipt-Studio-${version}-Source.zip`);
const staging = fs.mkdtempSync(path.join(out, '.source-'));
const folder = path.join(staging, 'Source');
const sevenZip = require('7zip-bin').path7za;
try {
  for (const file of files) {
    const destination = path.join(folder, file); fs.mkdirSync(path.dirname(destination), { recursive: true });
    let bytes = fs.readFileSync(path.join(root, file));
    if (file.endsWith('.cmd')) bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
    fs.writeFileSync(destination, bytes);
  }
  fs.rmSync(archive, { force: true });
  const result = spawnSync(sevenZip, ['a', '-tzip', '-mx=9', archive, 'Source'], { cwd: staging, encoding: 'utf8' });
  if (result.status !== 0) throw Error(result.stderr || result.error?.message || 'Source ZIP creation failed.');
  const check = spawnSync(sevenZip, ['t', archive], { encoding: 'utf8' });
  if (check.status !== 0) throw Error(check.stderr || 'Source ZIP integrity check failed.');
  console.log(`ZIP integrity verified: ${files.length} source files`);
} finally { fs.rmSync(staging, { recursive: true, force: true }); }
const bytes = fs.readFileSync(archive);
if (bytes.length > 10 * 1024 * 1024) throw Error('ZIP exceeds delivery limit.');
console.log(archive); console.log(`Size: ${bytes.length} bytes`);
console.log(`SHA-256: ${createHash('sha256').update(bytes).digest('hex')}`);
