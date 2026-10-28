(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./glyphs.js'));
  else root.ReceiptEngine = factory(root.ReceiptGlyphs);
})(globalThis, function (glyphs) {
  'use strict';
  const FORMAT = Object.freeze({ width: 355, pageWidth: 141.9987, pointsPerPixel: 0.4, cellWidth: 6, cellHeight: 14, rowStep: 22 });
  const COMPANIES = ['FINE NAME', 'VELTO TRANS'];
  function fail(message) { throw new Error(message); }
  function text(value, name, max, pattern = /^[A-Z0-9 .:/>-]+$/) {
    const result = String(value ?? '').trim().toUpperCase();
    if (!result || result.length > max || !pattern.test(result)) fail(`${name} must contain 1 to ${max} printable characters.`);
    for (const ch of result) if (!glyphs[ch]) fail(`${name} contains an unsupported character: ${ch}`);
    return result;
  }
  function dateValue(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) fail('Choose a valid date.');
    const [y, m, d] = value.split('-').map(Number);
    if (y < 1900 || y > 2100) fail('The date must be between 1900 and 2100.');
    const stamp = Date.UTC(y, m - 1, d);
    if (new Date(stamp).toISOString().slice(0, 10) !== value) fail('Choose a valid calendar date.');
    return stamp;
  }
  function minuteValue(value, label) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? '')) fail(`${label} must be a valid 24-hour time.`);
    const [h, m] = value.split(':').map(Number); return h * 60 + m;
  }
  function temperatureNumber(value, label) {
    if (value === '' || value === null || value === undefined) fail(`Enter ${label}.`);
    const literal = String(value).trim().replace(',', '.');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(literal)) fail(`Enter a valid ${label}.`);
    const n = Number(literal);
    if (!Number.isFinite(n) || n < -100 || n > 100) fail(`${label} must be between -100 and 100 °C.`);
    return Object.is(n, -0) ? 0 : n;
  }
  function temperatureRange(minimum, maximum, label) {
    const min = temperatureNumber(minimum, `${label} minimum`);
    const max = temperatureNumber(maximum, `${label} maximum`);
    if (min >= max) fail(`${label} minimum must be smaller than its maximum.`);
    let low = Math.floor(min * 10) + 1; let high = Math.ceil(max * 10) - 1;
    // Check the actual printed tenths, so neither endpoint can appear after rounding.
    while (low / 10 <= min) low++;
    while (high / 10 >= max) high--;
    if (low > high) fail(`${label} range contains no value at one decimal place. Widen the range.`);
    return { min, max, low, high };
  }
  function randomInteger(low, high, random) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) fail('Invalid random source.');
    return low + Math.floor(value * (high - low + 1));
  }
  function sensorSeries(stamps, range, random) {
    const values = []; let windowStart = 0;
    for (let i = 0; i < stamps.length; i++) {
      let low = range.low; let high = range.high;
      if (i) {
        const minutes = (stamps[i] - stamps[i - 1]) / 60000;
        const step = Math.min(5, Math.max(1, Math.floor(minutes * 5 / 15)));
        low = Math.max(low, values[i - 1] - step); high = Math.min(high, values[i - 1] + step);
        while (stamps[i] - stamps[windowStart] > 15 * 60000) windowStart++;
        // Also constrain every pair within 15 minutes, not just adjacent samples.
        for (let j = windowStart; j < i; j++) {
          low = Math.max(low, values[j] - 5); high = Math.min(high, values[j] + 5);
        }
      }
      values.push(randomInteger(low, high, random));
    }
    return values.map(value => (value / 10).toFixed(1));
  }
  function dmy(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
  function normalize(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('The input is invalid.');
    if (!COMPANIES.includes(input.company)) fail('Select FINE NAME or VELTO TRANS.');
    const date = String(input.date ?? ''); dateValue(date);
    const start = minuteValue(input.startTime, 'Start time');
    const end = minuteValue(input.endTime, 'End time');
    const interval = Number(input.interval ?? 15);
    if (!Number.isInteger(interval) || interval < 1 || interval > 1440) fail('Sampling interval must be 1 to 1440 minutes.');
    const setPoint = Number(input.setPoint1 ?? 2);
    if (!Number.isFinite(setPoint) || setPoint < -100 || setPoint > 100) fail('Set point 1 is invalid.');
    const range1 = temperatureRange(input.sensor1Min, input.sensor1Max, 'Sensor 1');
    const range2 = temperatureRange(input.sensor2Min, input.sensor2Max, 'Sensor 2');
    return {
      company: input.company, registration: text(input.registration, 'Registration', 18), date,
      startTime: input.startTime, endTime: input.endTime, interval, start, end,
      sensor1Min: range1.min, sensor1Max: range1.max, sensor2Min: range2.min, sensor2Max: range2.max,
      model: text(input.model || 'TOUCHLOG', 'Model', 20), serial: text(input.serial || '0825123146', 'Serial number', 20),
      setPoint1: String(Math.round(setPoint * 10) / 10), setPoint2: text(input.setPoint2 || 'OFF', 'Set point 2', 8)
    };
  }
  function generate(input, random = Math.random) {
    const settings = normalize(input); const midnight = dateValue(settings.date);
    const start = midnight + settings.start * 60000;
    const end = midnight + (settings.end < settings.start ? settings.end + 1440 : settings.end) * 60000;
    const stamps = [];
    for (let stamp = start; stamp <= end; stamp += settings.interval * 60000) stamps.push(stamp);
    if (stamps.at(-1) !== end) stamps.push(end);
    const sensor1 = sensorSeries(stamps, temperatureRange(settings.sensor1Min, settings.sensor1Max, 'Sensor 1'), random);
    const sensor2 = sensorSeries(stamps, temperatureRange(settings.sensor2Min, settings.sensor2Max, 'Sensor 2'), random);
    const readings = stamps.map((stamp, index) => {
      const iso = new Date(stamp).toISOString();
      return { date: iso.slice(0, 10), time: iso.slice(11, 16), sensor1: sensor1[index], sensor2: sensor2[index] };
    });
    return { settings, readings, count: readings.length, synthetic: true, overnight: settings.end < settings.start, layout: receiptLayout(settings, readings) };
  }
  function receiptLayout(settings, readings) {
    if (!readings.length) fail('No readings to display.');
    // Character-column positions follow the original left-hand receipt.
    // Both rules occupy the same columns. No footer or page-size padding.
    const items = [
      [96, 24, '--------------------'], [30, 46, settings.company],
      [24, 112, 'NR. INMATRICULARE'], [210, 112, settings.registration],
      [24, 134, 'MODEL'], [216, 134, settings.model],
      [24, 156, 'SERIE APARAT:'], [216, 156, settings.serial],
      [24, 178, `SET POINT  1: ${settings.setPoint1}  2:${settings.setPoint2}`],
      [24, 200, dmy(settings.date)], [264, 200, '°C'],
      [24, 244, 'I1: FATA'], [150, 244, 'I2: SPATE'],
      [96, 266, '--------------------']
    ];
    function tableHeader(date, y) {
      items.push([24, y, dmy(date)]);
      for (let sensor = 0; sensor < 6; sensor++) items.push([84 + sensor * 36, y + FORMAT.rowStep, `I${sensor + 1}`]);
      return y + FORMAT.rowStep * 2;
    }
    let date = readings[0].date; let y = tableHeader(date, 332);
    for (const reading of readings) {
      if (reading.date !== date) {
        date = reading.date; y = tableHeader(date, y + FORMAT.rowStep);
      }
      items.push([24, y, reading.time], [96 - reading.sensor1.length * 6, y, reading.sensor1], [132 - reading.sensor2.length * 6, y, reading.sensor2]);
      y += FORMAT.rowStep;
    }
    const height = y - FORMAT.rowStep + FORMAT.cellHeight + 24;
    return { width: FORMAT.width, height, pageWidth: FORMAT.pageWidth, pageHeight: Number((height * FORMAT.pointsPerPixel).toFixed(4)), items };
  }
  function renderReceipt(report) {
    const layout = receiptLayout(report.settings, report.readings);
    const pixels = new Uint8Array(layout.width * layout.height * 3); pixels.fill(255);
    function draw(x, y, value) {
      const content = String(value);
      if (x < 0 || x + content.length * 6 > layout.width || y < 0 || y + 14 > layout.height) fail(`Text does not fit: ${content}`);
      for (let i = 0; i < content.length; i++) {
        const mask = glyphs[content[i]]; if (!mask) fail(`Unsupported character: ${content[i]}`);
        for (let yy = 0; yy < 14; yy++) for (let xx = 0; xx < 6; xx++) {
          if (mask[yy] & (1 << xx)) {
            const offset = ((y + yy) * layout.width + x + i * 6 + xx) * 3;
            pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
          }
        }
      }
    }
    for (const item of layout.items) draw(...item);
    return { width: layout.width, height: layout.height, pixels };
  }
  function renderToCanvas(canvas, report) {
    const { width, height, pixels: rgb } = renderReceipt(report);
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false }); const image = context.createImageData(width, height);
    for (let i = 0, p = 0; i < rgb.length; i += 3, p += 4) { image.data[p] = rgb[i]; image.data[p + 1] = rgb[i + 1]; image.data[p + 2] = rgb[i + 2]; image.data[p + 3] = 255; }
    context.putImageData(image, 0, 0);
  }
  return { FORMAT, COMPANIES, normalize, generate, receiptLayout, renderReceipt, renderToCanvas, dmy };
});
