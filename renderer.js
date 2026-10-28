'use strict';
const $ = id => document.getElementById(id);
let packet = null; let dirty = false; let toastTimer;
const fields = ['company','registration','date','startTime','endTime','sensor1Min','sensor1Max','sensor2Min','sensor2Max','interval','model','serial','setPoint1','setPoint2'];
function populate(settings) {
  if (!settings) return;
  const values = { ...settings };
  for (const sensor of ['sensor1','sensor2']) {
    // Carry forward earlier fixed-temperature settings as a centered editable range.
    if (values[`${sensor}Min`] === undefined && values[sensor] !== undefined) {
      const old = Number(values[sensor]);
      if (Number.isFinite(old)) { values[`${sensor}Min`] = Math.max(-100, old - 1); values[`${sensor}Max`] = Math.min(100, old + 1); }
    }
  }
  for (const field of fields) if (values[field] !== undefined) $(field).value = values[field];
}
function inputValues() { return Object.fromEntries(fields.map(field => [field, $(field).value])); }
function error(message) { $('form-error').textContent = message || ''; $('form-error').hidden = !message; }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 8000); }
function state(label) { $('preview-state').textContent = label; }
function markDirty() {
  if (!packet) return;
  dirty = true; $('export-button').disabled = true; state('Inputs changed');
  $('preview-summary').textContent = 'Regenerate preview';
}
function zoom() {
  const factor = Number($('zoom').value); const canvas = $('receipt-canvas');
  canvas.style.width = `${canvas.width * factor}px`; canvas.style.height = `${canvas.height * factor}px`;
}
function showReceipt() {
  if (!packet) return;
  const report = packet.report;
  ReceiptEngine.renderToCanvas($('receipt-canvas'), report);
  $('receipt-canvas').setAttribute('aria-label', `${report.settings.company}, ${report.count} readings, ${ReceiptEngine.dmy(report.settings.date)}`);
  $('preview-scroll').scrollTop = 0; zoom();
}
function displayReport(result) {
  packet = result; dirty = false;
  $('empty-state').hidden = true; $('paper-stage').hidden = false; $('preview-controls').hidden = false;
  const { report } = result;
  $('preview-summary').textContent = `${report.count} readings · ${report.settings.startTime} to ${report.settings.endTime}${report.overnight ? ' next day' : ''}`;
  $('export-button').disabled = !window.receiptApp; state('Ready to export'); showReceipt();
}
$('log-form').addEventListener('submit', async event => {
  event.preventDefault(); error(''); const button = $('generate-button'); button.disabled = true; button.textContent = 'Generating…';
  try {
    const input = inputValues();
    const result = window.receiptApp ? await window.receiptApp.generatePreview(input) : { ok: true, id: 'browser-preview', report: ReceiptEngine.generate(input) };
    if (!result.ok) throw new Error(result.error);
    displayReport(result);
    if (!window.receiptApp) toast('Browser preview only. Start the Electron app to export PDF.');
  } catch (exception) { error(exception.message); }
  finally { button.disabled = false; button.textContent = 'Generate preview'; }
});
$('log-form').addEventListener('input', markDirty); $('log-form').addEventListener('change', markDirty);
$('zoom').addEventListener('change', zoom);
$('export-button').addEventListener('click', async () => {
  if (!packet || dirty || !window.receiptApp) return;
  const button = $('export-button'); button.disabled = true; button.textContent = 'Saving…';
  try { const result = await window.receiptApp.exportPdf(packet.id); if (!result.ok) throw new Error(result.error); if (!result.canceled) toast(`Saved PDF to ${result.path}`); }
  catch (exception) { toast(exception.message); }
  finally { button.textContent = 'Export to PDF'; button.disabled = dirty || !packet; }
});
(async () => {
  const today = new Date(); const date = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  $('date').value = date;
  if (window.receiptApp) {
    try { const loaded = await window.receiptApp.loadSettings(); populate(loaded.settings); }
    catch (exception) { toast(`Could not restore previous inputs: ${exception.message}`); }
  }
})();
