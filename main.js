'use strict';
const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const engine = require('./engine');
const { buildPdf } = require('./pdf');
let window; let current = null; let currentId = null;
const selfTest = process.argv.includes('--self-test');
if (selfTest) {
  const timeout = setTimeout(() => { console.error('ELECTRON_SELF_TEST_FAILED: timed out'); app.exit(1); }, 60000);
  timeout.unref();
}
if (process.platform === 'win32') app.setAppUserModelId('com.receiptstudio.desktop');
nativeTheme.themeSource = 'dark';
if (selfTest || process.env.RECEIPT_STUDIO_TEST_DIR) app.setPath('userData', process.env.RECEIPT_STUDIO_TEST_DIR || path.join(__dirname, '.test-data'));
function settingsPath() { return path.join(app.getPath('userData'), 'inputs.json'); }
function readSettings() {
  try { const p = settingsPath(); if (fs.statSync(p).size > 20000) return null; return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function persist(settings) {
  const directory = app.getPath('userData'); fs.mkdirSync(directory, { recursive: true });
  const p = settingsPath(); fs.writeFileSync(p + '.tmp', JSON.stringify(settings, null, 2)); fs.renameSync(p + '.tmp', p);
}
function checkSender(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted request.');
}
ipcMain.handle('receipt:load-settings', event => { checkSender(event); return { settings: readSettings(), version: app.getVersion(), format: engine.FORMAT }; });
ipcMain.handle('receipt:generate', (event, input) => {
  checkSender(event);
  try { const report = engine.generate(input); current = report; currentId = randomUUID(); persist(report.settings); return { ok: true, id: currentId, report }; }
  catch (error) { return { ok: false, error: error.message }; }
});
ipcMain.handle('receipt:export-pdf', async (event, id) => {
  checkSender(event);
  if (!current || id !== currentId) return { ok: false, error: 'Generate the preview again before exporting.' };
  const snapshot = current;
  const name = `${snapshot.settings.company.replace(/ /g, '_')}_${snapshot.settings.registration.replace(/[^A-Z0-9-]/g, '_')}_${snapshot.settings.date}.pdf`;
  const choice = await dialog.showSaveDialog(window, { title: 'Export PDF', defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (choice.canceled || !choice.filePath) return { ok: true, canceled: true };
  try { const bytes = buildPdf(snapshot); fs.writeFileSync(choice.filePath, bytes); return { ok: true, path: choice.filePath }; }
  catch (error) { return { ok: false, error: `Could not save the PDF: ${error.message}` }; }
});
function createWindow() {
  window = new BrowserWindow({ width: 1240, height: 880, minWidth: 980, minHeight: 660, title: 'Receipt Studio', backgroundColor: '#111315', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.loadFile(path.join(__dirname, 'index.html'));
  window.on('closed', () => { window = null; });
  if (selfTest) window.webContents.once('did-finish-load', async () => {
    try {
      const result = await require('./tests/electron-test').run(window, dialog, () => current);
      console.log('ELECTRON_SELF_TEST_OK', JSON.stringify(result)); app.exit(0);
    } catch (error) { console.error('ELECTRON_SELF_TEST_FAILED', error); app.exit(1); }
  });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin' || selfTest) app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
