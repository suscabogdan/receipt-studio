'use strict';
const zlib = require('node:zlib');
const engine = require('./engine');
function ascii85(buffer) {
  let result = '';
  for (let i = 0; i < buffer.length; i += 4) {
    const n = Math.min(4, buffer.length - i); let value = 0;
    for (let j = 0; j < 4; j++) value = value * 256 + (j < n ? buffer[i + j] : 0);
    if (n === 4 && value === 0) { result += 'z'; continue; }
    const chars = new Array(5);
    for (let j = 4; j >= 0; j--) { chars[j] = String.fromCharCode(value % 85 + 33); value = Math.floor(value / 85); }
    result += chars.slice(0, n + 1).join('');
  }
  return result + '~>';
}
function buildPdf(report) {
  if (!report || !report.readings?.length) throw new Error('No valid preview to export.');
  const objects = [null];
  function add(value) { objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value, 'ascii')); return objects.length - 1; }
  const title = report.synthetic ? 'Synthetic temperature log' : 'Manually entered temperature log';
  const subject = report.synthetic ? ' /Subject (Synthetic test data, not recorded sensor measurements)' : '';
  const catalog = add(''); const pagesId = add(''); const info = add(`<< /Title (${title})${subject} /Creator (Receipt Studio) /Producer (Continuous receipt exporter) >>`);
  const font = add('<< /BaseFont /Helvetica /Encoding /WinAnsiEncoding /Subtype /Type1 /Type /Font >>');
  const resources = add(`<< /F1 ${font} 0 R >>`);
  const { width, height, pixels } = engine.renderReceipt(report);
  const pageHeight = Number((height * engine.FORMAT.pointsPerPixel).toFixed(4));
  const pageWidth = engine.FORMAT.pageWidth;
  const encoded = Buffer.from(ascii85(zlib.deflateSync(pixels)), 'ascii');
  const image = add(Buffer.concat([Buffer.from(`<< /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter [ /ASCII85Decode /FlateDecode ] /Height ${height} /Length ${encoded.length} /Subtype /Image /Type /XObject /Width ${width} >>\nstream\n`), encoded, Buffer.from('\nendstream')]));
  const paint = Buffer.from(ascii85(zlib.deflateSync(Buffer.from(`1 0 0 1 0 0 cm BT /F1 12 Tf 14.4 TL ET\nq\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/ReceiptImage Do\nQ\n`))), 'ascii');
  const content = add(Buffer.concat([Buffer.from(`<< /Filter [ /ASCII85Decode /FlateDecode ] /Length ${paint.length} >>\nstream\n`), paint, Buffer.from('\nendstream')]));
  const pageId = add(`<< /Contents ${content} 0 R /MediaBox [ 0 0 ${pageWidth} ${pageHeight} ] /Parent ${pagesId} 0 R /Resources << /Font ${resources} 0 R /ProcSet [ /PDF /Text /ImageB /ImageC /ImageI ] /XObject << /ReceiptImage ${image} 0 R >> >> /Rotate 0 /Type /Page >>`);
  objects[catalog] = Buffer.from(`<< /PageMode /UseNone /Pages ${pagesId} 0 R /Type /Catalog >>`);
  objects[pagesId] = Buffer.from(`<< /Count 1 /Kids [ ${pageId} 0 R ] /Type /Pages >>`);
  const parts = [Buffer.from('%PDF-1.3\n%\xe2\xe3\xcf\xd3\n', 'binary')]; const offsets = [0]; let length = parts[0].length;
  for (let i = 1; i < objects.length; i++) {
    offsets.push(length); const block = Buffer.concat([Buffer.from(`${i} 0 obj\n`), objects[i], Buffer.from('\nendobj\n')]); parts.push(block); length += block.length;
  }
  let tail = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) tail += `${String(offset).padStart(10, '0')} 00000 n \n`;
  tail += `trailer\n<< /Size ${objects.length} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(tail)); return Buffer.concat(parts);
}
module.exports = { buildPdf, ascii85 };
