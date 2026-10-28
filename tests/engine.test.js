'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const engine = require('../engine');
const { buildPdf, ascii85 } = require('../pdf');
const input = { company:'FINE NAME',registration:'CS-36-VDC',date:'2026-10-05',startTime:'08:00',endTime:'10:00',interval:15,sensor1Min:2,sensor1Max:4,sensor2Min:-20,sensor2Max:-18 };
function seeded(seed) { return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296; }; }
function verifySeries(r) {
  const stamps=r.readings.map(x=>Date.parse(`${x.date}T${x.time}:00Z`));
  for (const sensor of ['sensor1','sensor2']) {
    const values=r.readings.map(x=>Math.round(Number(x[sensor])*10));
    values.forEach((value,i)=>{
      assert.ok(value/10>r.settings[`${sensor}Min`]&&value/10<r.settings[`${sensor}Max`]);
      if(i)assert.ok(Math.abs(value-values[i-1])<=5);
      for(let j=i-1;j>=0&&stamps[i]-stamps[j]<=15*60000;j--)assert.ok(Math.abs(value-values[j])<=5);
    });
  }
}
function crop(pixels, width, x, y, w, h=14) {
  const rows=[];for(let yy=0;yy<h;yy++) rows.push(pixels.subarray(((y+yy)*width+x)*3,((y+yy)*width+x+w)*3));
  return Buffer.concat(rows);
}
test('both companies generate one continuous 355-pixel receipt', () => {
  for (const company of engine.COMPANIES) {
    const r=engine.generate({...input,company});const image=engine.renderReceipt(r);
    assert.equal(r.count,9);assert.equal(r.pages,undefined);assert.equal(r.settings.company,company);
    assert.equal(image.width,355);assert.equal(image.height,590);assert.equal(image.pixels.length,355*590*3);
  }
});
test('more readings extend the receipt without page breaks or smaller text', () => {
  const r=engine.generate({...input,startTime:'01:01',endTime:'08:31'});
  assert.equal(r.count,31);assert.equal(r.layout.height,1074);assert.equal(r.layout.pageHeight,429.6);
  verifySeries(r);
  const rows=r.layout.items.filter(item=>/^\d{2}:\d{2}$/.test(item[2]));
  assert.equal(rows.length,31);assert.equal(rows[0][1],376);assert.equal(rows.at(-1)[1],1036);
  assert.ok(rows.slice(1).every((row,i)=>row[1]-rows[i][1]===22));
});
test('midnight inserts a dated table heading in the same continuous strip', () => {
  const r=engine.generate({...input,date:'2026-12-31',startTime:'23:30',endTime:'00:30'});
  assert.equal(r.overnight,true);assert.equal(r.count,5);assert.equal(r.pages,undefined);
  assert.deepEqual([...new Set(r.readings.map(x=>x.date))],['2026-12-31','2027-01-01']);
  assert.ok(r.layout.items.some(item=>item[2]==='01/01/2027'));
  assert.equal((buildPdf(r).toString('latin1').match(/\/Type \/Page\b/g)||[]).length,1);
});
test('equal start/end means one reading; off-grid end is included', () => {
  assert.equal(engine.generate({...input,startTime:'08:00',endTime:'08:00'}).count,1);
  const r=engine.generate({...input,startTime:'08:01',endTime:'09:00'});
  assert.deepEqual(r.readings.map(x=>x.time),['08:01','08:16','08:31','08:46','09:00']);
});
test('invalid inputs are rejected and decimal comma/negative zero are handled', () => {
  for (const change of [{date:'2026-02-30'},{startTime:'24:00'},{sensor1Min:''},{sensor1Max:'   '},{sensor2Min:'NaN'},{sensor2Max:101},{sensor1Min:4},{sensor1Min:5},{sensor1Min:2.2,sensor1Max:2.3},{interval:0},{company:'OTHER'},{registration:'<script>'},{registration:'X'.repeat(19)}]) assert.throws(()=>engine.generate({...input,...change}));
  const r=engine.generate({...input,sensor1Min:'2,1',sensor1Max:'3,9',sensor2Min:'-0.1',sensor2Max:'0.1'});
  assert.equal(r.settings.sensor1Min,2.1);assert.equal(r.settings.sensor1Max,3.9);assert.ok(r.readings.every(x=>x.sensor2==='0.0'));
});
test('all registration capitals and the corrected digit 8 remain printable', () => {
  for (const registration of ['J-KQW-XYZ','AB-123-CD']) assert.doesNotThrow(()=>engine.renderReceipt(engine.generate({...input,registration})));
  const glyphs=require('../glyphs');
  assert.deepEqual(glyphs['8'],[14,14,17,17,17,17,14,14,17,17,17,17,14,14]);assert.notDeepEqual(glyphs['8'],glyphs['0']);
});
test('matching top/bottom rules enclose the original header layout', () => {
  const r=engine.generate(input);const items=r.layout.items;
  const rules=items.filter(x=>x[2]==='--------------------');assert.deepEqual(rules,[[96,24,'--------------------'],[96,266,'--------------------']]);
  const front=items.find(x=>x[2]==='I1: FATA');const rear=items.find(x=>x[2]==='I2: SPATE');
  assert.deepEqual(front,[24,244,'I1: FATA']);assert.deepEqual(rear,[150,244,'I2: SPATE']);assert.ok(front[1]<rules[1][1]);
  assert.deepEqual(items.find(x=>x[2]==='NR. INMATRICULARE'),[24,112,'NR. INMATRICULARE']);
  assert.deepEqual(items.find(x=>x[2]==='CS-36-VDC'),[210,112,'CS-36-VDC']);
  assert.equal(items.filter(x=>x[2]==='°C').length,1);
  assert.deepEqual(items.find(x=>x[2]==='I1'),[84,354,'I1']);
  const image=engine.renderReceipt(r);const bytes=Buffer.from(image.pixels);
  assert.equal(Buffer.compare(crop(bytes,355,96,24,120),crop(bytes,355,96,266,120)),0);
});
test('no page number, bottom company or bottom date is rendered', () => {
  const r=engine.generate(input);const items=r.layout.items;
  assert.equal(items.filter(x=>x[2]===input.company).length,1);assert.ok(items.every(x=>!x[2].startsWith('PAGE ')));
  const last=items.at(-1);assert.equal(last[2],r.readings.at(-1).sensor2);assert.equal(r.layout.height,last[1]+14+24);
  const {pixels,height}=engine.renderReceipt(r);assert.ok(pixels.subarray((height-24)*355*3).every(x=>x===255));
});
test('numeric cells keep the accepted glyph pixels after repositioning', () => {
  const settings={company:'CTE TRAILERS RO',registration:'1220025',date:'2026-09-25',model:'TOUCHLOG',serial:'0825123146',setPoint1:'2',setPoint2:'OFF'};
  const data=[['01:01','2.6','0.5'],['01:16','3.0','1.0'],['01:31','3.3','1.5'],['01:46','3.6','1.7'],['02:01','3.8','-4.1'],['02:16','4.1','0.0'],['02:31','4.0','0.4'],['02:46','3.8','1.0'],['03:01','3.8','1.3']];
  const readings=data.map(([time,sensor1,sensor2])=>({date:settings.date,time,sensor1,sensor2}));
  const actual=Buffer.from(engine.renderReceipt({settings,readings}).pixels);
  const old=zlib.inflateSync(fs.readFileSync(path.join(__dirname,'fixtures','winning-page.rgb.deflate')));
  const eight=[14,14,17,17,17,17,14,14,17,17,17,17,14,14];
  for(const y of [479,545,567]) for(let yy=0;yy<14;yy++) for(let xx=0;xx<6;xx++) {
    const offset=((y+yy)*355+106+xx)*3;const value=eight[yy]&(1<<xx)?0:255;old[offset]=old[offset+1]=old[offset+2]=value;
  }
  data.forEach(([time,s1,s2],i)=>{
    const pairs=[[24,31,time.length],[96-s1.length*6,112-s1.length*6,s1.length],[132-s2.length*6,154-s2.length*6,s2.length]];
    for(const [newX,oldX,length] of pairs) assert.equal(Buffer.compare(crop(actual,355,newX,376+i*22,length*6),crop(old,355,oldX,391+i*22,length*6)),0);
  });
});
test('the longest selectable minute-by-minute range stays on one growing strip', () => {
  const r=engine.generate({...input,startTime:'00:01',endTime:'00:00',interval:1});
  assert.equal(r.count,1440);assert.equal(r.layout.height,32138);assert.equal(r.layout.pageHeight,12855.2);
  const image=engine.renderReceipt(r);assert.equal(image.pixels.length,355*32138*3);
  const pdf=buildPdf(r).toString('latin1');assert.equal((pdf.match(/\/Type \/Page\b/g)||[]).length,1);
});
test('PDF uses one custom-height RGB image page and retains the encoding/width', () => {
  const r=engine.generate({...input,startTime:'01:01',endTime:'08:31'});const b=buildPdf(r);const s=b.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.3'));assert.ok(s.endsWith('%%EOF\n'));assert.equal((s.match(/\/Type \/Page\b/g)||[]).length,1);
  assert.ok(s.includes('/MediaBox [ 0 0 141.9987 429.6 ]'));assert.ok(s.includes('/Height 1074'));assert.ok(s.includes('/Width 355'));
  assert.ok(s.includes('/ColorSpace /DeviceRGB'));assert.ok(s.includes('/BitsPerComponent 8'));assert.ok(s.includes('/ASCII85Decode /FlateDecode'));
  assert.ok(s.includes('/Title (Synthetic temperature log)'));assert.ok(s.includes('not recorded sensor measurements'));
});
test('ASCII85 retains standard known vectors and partial blocks', () => {
  assert.equal(ascii85(Buffer.from([0,0,0,0])),'z~>');assert.equal(ascii85(Buffer.from('Man ')),'9jqo^~>');assert.equal(ascii85(Buffer.from('Man')),'9jqo~>');
});
test('positive and negative endpoints are excluded even at the random-source extremes', () => {
  for(const random of [()=>0,()=>0.9999999999999999]) {
    const r=engine.generate(input,random);verifySeries(r);
    assert.ok(r.readings.every(x=>!['2.0','4.0'].includes(x.sensor1)&&!['-20.0','-18.0'].includes(x.sensor2)));
  }
});
test('fractional limits are applied to the actual one-decimal printed values', () => {
  for(let seed=1;seed<=30;seed++) {
    const r=engine.generate({...input,sensor1Min:2.14,sensor1Max:3.96,sensor2Min:-20.25,sensor2Max:-18.22},seeded(seed));
    verifySeries(r);assert.ok(r.readings.every(x=>/^-?\d+\.\d$/.test(x.sensor1)&&/^-?\d+\.\d$/.test(x.sensor2)));
  }
});
test('every reading pair within 15 minutes stays within 0.5 at all sampling intervals', () => {
  for(const interval of [1,5,10,15,30,60])for(let seed=1;seed<=40;seed++) {
    const r=engine.generate({...input,startTime:'00:01',endTime:'00:00',interval,sensor1Min:-99.9,sensor1Max:99.9,sensor2Min:-30,sensor2Max:-15},seeded(seed));
    verifySeries(r);
  }
});
test('random readings vary, can move up/down, and the two sensors use separate ranges', () => {
  const r=engine.generate({...input,startTime:'00:00',endTime:'23:59'},seeded(731));verifySeries(r);
  for(const sensor of ['sensor1','sensor2']) {
    const values=r.readings.map(x=>Number(x[sensor]));assert.ok(new Set(values).size>1);
    assert.ok(values.some((x,i)=>i&&x>values[i-1]));assert.ok(values.some((x,i)=>i&&x<values[i-1]));
  }
});
test('a narrow range with one legal printed value works without touching the limits', () => {
  const r=engine.generate({...input,sensor1Min:2.21,sensor1Max:2.39,sensor2Min:-18.59,sensor2Max:-18.41},seeded(12));
  assert.ok(r.readings.every(x=>x.sensor1==='2.3'&&x.sensor2==='-18.5'));verifySeries(r);
  assert.throws(()=>engine.generate({...input,sensor1Min:2.21,sensor1Max:2.29}),/Widen the range/);
});
test('off-grid end time and midnight also preserve the drift limit', () => {
  for(const [startTime,endTime,interval] of [['23:40','00:17',15],['08:01','09:00',15],['23:53','00:19',5]]) {
    const r=engine.generate({...input,startTime,endTime,interval},seeded(917));verifySeries(r);
    assert.equal(r.readings.at(-1).time,endTime);
  }
});
test('rendering and repeated PDF exports never randomize an existing preview', () => {
  const r=engine.generate(input,seeded(44));const original=JSON.stringify(r.readings);
  const previous=Math.random;Math.random=()=>{throw Error('Unexpected random generation during export');};
  try {
    const a=buildPdf(r),b=buildPdf(r);assert.equal(Buffer.compare(a,b),0);engine.renderReceipt(r);
    assert.equal(JSON.stringify(r.readings),original);
  }finally{Math.random=previous;}
  assert.notDeepEqual(engine.generate(input,seeded(44)).readings,engine.generate(input,seeded(45)).readings);
});
