'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const metadata = JSON.parse(read('package.json'));

test('the manifest and lockfile pin the same dependencies', () => {
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual(lock.packages[''].devDependencies, metadata.devDependencies);
  assert.deepEqual(lock.packages[''].engines, metadata.engines);
  assert.equal(lock.packages['node_modules/electron'].version, metadata.devDependencies.electron);
  for (const command of ['start', 'dev', 'run']) assert.equal(metadata.scripts[command], 'electron .');
  assert.equal(metadata.main, 'main.js');
});

test('Windows bootstrap uses the pinned Electron version and official checksum', () => {
  const version = metadata.devDependencies.electron;
  const checksums = JSON.parse(read('node_modules/electron/checksums.json'));
  const checksum = checksums[`electron-v${version}-win32-x64.zip`];
  assert.match(checksum, /^[a-f0-9]{64}$/);
  const launcher = read('Start-Windows.cmd');
  assert.ok(launcher.includes(`https://github.com/electron/electron/releases/download/v${version}/electron-v${version}-win32-x64.zip`));
  assert.ok(launcher.includes(`.runtime-${version}-win-x64`));
  assert.ok(launcher.includes(`$hash -ne '${checksum}'`));
  assert.ok(launcher.includes('Get-FileHash'));
  assert.ok(launcher.includes('exit /b 1'));
});

test('every packaged runtime file exists without files from the parent folder', () => {
  for (const file of metadata.build.files) {
    assert.equal(path.basename(file), file);
    assert.ok(fs.statSync(path.join(root, file)).isFile());
  }
  assert.ok(read('index.html').includes("connect-src 'none'"));
  assert.ok(read('main.js').includes('contextIsolation: true, nodeIntegration: false, sandbox: true'));
});
