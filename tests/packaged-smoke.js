'use strict';
// Exercise the exact ASAR shipped in the Windows build using the host Electron.
// This checks the packaged renderer/preload/export, not Windows OS behavior.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const asar = path.resolve(process.env.RECEIPT_STUDIO_ASAR || path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar'));
const directory = path.join(root, 'test-artifacts');
const destination = path.join(directory, 'packaged-smoke.pdf');
process.env.RECEIPT_STUDIO_TEST_DIR = path.join(root, '.packaged-test-data');
fs.mkdirSync(directory, { recursive: true });
assert.ok(require('original-fs').statSync(asar).isFile(), 'Build the Windows package first.');
let dialogs = 0;
dialog.showSaveDialog = async (_window, options) => {
  assert.equal(options.filters[0].extensions[0], 'pdf'); dialogs++;
  return { canceled: false, filePath: destination };
};
const timer = setTimeout(() => { console.error('PACKAGED_SMOKE_FAILED: timed out'); app.exit(1); }, 30000);
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      const js = source => window.webContents.executeJavaScript(source);
      const wait = async source => {
        for (let i = 0; i < 100; i++) {
          if (await js(source)) return;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw Error(`Timed out: ${source}`);
      };
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.ok(window.webContents.getURL().includes('app.asar/index.html'));
      assert.equal(await js('typeof window.require'), 'undefined');
      assert.equal(await js("getComputedStyle(document.documentElement).colorScheme"), 'dark');
      const input = { company: 'VELTO TRANS', registration: 'CS-36-VDC', date: '2026-10-05', startTime: '08:00', endTime: '15:30', interval: '15', sensor1Min: '2', sensor1Max: '4', sensor2Min: '-20', sensor2Max: '-18' };
      await js(`for(const [id,value] of Object.entries(${JSON.stringify(input)})){const field=document.getElementById(id);field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));}document.getElementById('generate-button').click();`);
      await wait("document.getElementById('preview-state').textContent==='Ready to export'");
      const report = await js('packet.report');
      assert.equal(report.count, 31); assert.equal(report.layout.height, 1074);
      for (const sensor of ['sensor1', 'sensor2']) {
        const values = report.readings.map(reading => Math.round(Number(reading[sensor]) * 10));
        values.forEach((value, i) => {
          assert.ok(value / 10 > report.settings[`${sensor}Min`] && value / 10 < report.settings[`${sensor}Max`]);
          if (i) assert.ok(Math.abs(value - values[i - 1]) <= 5);
        });
      }
      assert.equal(await js(`(()=>{const canvas=document.getElementById('receipt-canvas');const expected=ReceiptEngine.renderReceipt(packet.report);const actual=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let i=0,p=0;i<expected.pixels.length;i+=3,p+=4){if(actual[p]!==expected.pixels[i]||actual[p+1]!==expected.pixels[i+1]||actual[p+2]!==expected.pixels[i+2])return false;}return true;})()`), true);
      await js("document.getElementById('export-button').click()");
      await wait("document.getElementById('toast').textContent.startsWith('Saved PDF to ')");
      assert.equal(dialogs, 1);
      const bytes = fs.readFileSync(destination);
      assert.equal(Buffer.compare(bytes, require(path.join(asar, 'pdf.js')).buildPdf(report)), 0);
      assert.equal(JSON.stringify(await js('packet.report')), JSON.stringify(report));
      assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
      fs.writeFileSync(path.join(directory, 'packaged-smoke.png'), (await window.webContents.capturePage()).toPNG());
      const result = { passed: true, host: process.platform, windowsRuntimeTest: false, asar, count: report.count, receiptHeight: report.layout.height, previewMatchesExport: true, sensorRangesAndSmoothness: true, darkTheme: true, sandbox: true, pdfSha256: createHash('sha256').update(bytes).digest('hex') };
      fs.writeFileSync(path.join(directory, 'packaged-smoke.json'), JSON.stringify(result, null, 2));
      console.log('PACKAGED_SMOKE_OK', JSON.stringify(result));
      clearTimeout(timer); app.exit(0);
    } catch (error) { console.error('PACKAGED_SMOKE_FAILED', error); clearTimeout(timer); app.exit(1); }
  });
});
require(path.join(asar, 'main.js'));
