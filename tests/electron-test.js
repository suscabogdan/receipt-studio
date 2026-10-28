'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPdf } = require('../pdf');
exports.run = async function (window, dialog, getReport) {
  const directory = path.join(__dirname, '..', 'test-artifacts');
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, 'electron-generated.pdf');
  const js = source => window.webContents.executeJavaScript(source);
  const wait = async source => {
    for (let attempt=0;attempt<100;attempt++) {
      if (await js(source)) return;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error(`UI timed out: ${source}`);
  };
  let canceled=false;let dialogs=0;
  dialog.showSaveDialog=async (_window,options)=>{
    assert.equal(options.filters[0].extensions[0],'pdf');dialogs++;
    return canceled?{canceled:true}:{canceled:false,filePath:destination};
  };
  const generate=async values=>{
    await js(`for(const [id,value] of Object.entries(${JSON.stringify(values)})){const field=document.getElementById(id);field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));}document.getElementById('generate-button').click();`);
    await wait(`document.getElementById('preview-state').textContent==='Ready to export'`);
  };
  const save=async ()=>{
    await js(`document.getElementById('toast').textContent='';document.getElementById('export-button').click();`);
    await wait(`document.getElementById('toast').textContent.startsWith('Saved PDF to ') && !document.getElementById('export-button').disabled`);
    assert.equal(Buffer.compare(fs.readFileSync(destination),buildPdf(getReport())),0);
  };
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(await js(`getComputedStyle(document.documentElement).colorScheme`),'dark');
  assert.equal(await js(`matchMedia('(prefers-color-scheme: dark)').matches`),true);
  assert.equal(await js(`getComputedStyle(document.querySelector('.editor-panel')).backgroundColor`),'rgb(22, 24, 27)');
  assert.equal(await js(`['Your log','Enter the details you want to print.','Verified print format','Your receipt appears here','Runs locally.'].some(text=>document.body.innerText.includes(text))`),false);
  assert.equal(await js(`document.getElementById('next-page')===null && document.getElementById('previous-page')===null && document.getElementById('page-position')===null`),true);
  await js(`populate({sensor1:3.1,sensor2:-18.5})`);
  assert.deepEqual(await js(`['sensor1Min','sensor1Max','sensor2Min','sensor2Max'].map(id=>document.getElementById(id).value)`),['2.1','4.1','-19.5','-17.5']);
  await generate({company:'VELTO TRANS',registration:'CS-36-VDC',date:'2026-10-05',startTime:'08:00',endTime:'10:00',interval:'15',sensor1Min:'2',sensor1Max:'4',sensor2Min:'-20',sensor2Max:'-18'});
  assert.equal(getReport().count,9);assert.equal(getReport().layout.height,590);
  assert.equal(await js(`typeof window.require`),'undefined');
  assert.equal(await js(`(()=>{
    const canvas=document.getElementById('receipt-canvas');const expected=ReceiptEngine.renderReceipt(packet.report);
    const actual=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    for(let i=0,p=0;i<expected.pixels.length;i+=3,p+=4)if(actual[p]!==expected.pixels[i]||actual[p+1]!==expected.pixels[i+1]||actual[p+2]!==expected.pixels[i+2])return false;
    return canvas.width===355&&canvas.height===590;
  })()`),true);
  const firstReadings=JSON.stringify(getReport().readings);
  await save();assert.equal(JSON.stringify(getReport().readings),firstReadings);
  canceled=true;
  await js(`document.getElementById('export-button').click()`);
  await wait(`document.getElementById('export-button').textContent==='Export to PDF' && !document.getElementById('export-button').disabled`);
  assert.equal(dialogs,2);
  assert.equal((await js(`window.receiptApp.exportPdf('stale-id')`)).ok,false);
  await js(`document.getElementById('sensor1Min').value='2.2';document.getElementById('sensor1Max').value='2.3';document.getElementById('sensor1Min').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('generate-button').click();`);
  await wait(`!document.getElementById('form-error').hidden && document.getElementById('form-error').textContent.includes('Widen the range')`);
  assert.equal(await js(`document.getElementById('export-button').disabled`),true);
  await js(`document.getElementById('endTime').value='15:30';document.getElementById('endTime').dispatchEvent(new Event('input',{bubbles:true}));`);
  assert.equal(await js(`document.getElementById('export-button').disabled`),true);
  // Exercise the tallest possible interval without pagination or clipping.
  await generate({company:'FINE NAME',startTime:'00:01',endTime:'00:00',interval:'1',sensor1Min:'2',sensor1Max:'4'});
  assert.equal(getReport().count,1440);assert.equal(getReport().layout.height,32138);
  for(const sensor of ['sensor1','sensor2']) {
    const report=getReport();const values=report.readings.map(x=>Math.round(Number(x[sensor])*10));
    values.forEach((value,i)=>{
      assert.ok(value/10>report.settings[`${sensor}Min`]&&value/10<report.settings[`${sensor}Max`]);
      for(let j=Math.max(0,i-15);j<i;j++)assert.ok(Math.abs(value-values[j])<=5);
    });
  }
  assert.equal(await js(`(()=>{
    const canvas=document.getElementById('receipt-canvas');const expected=ReceiptEngine.renderReceipt(packet.report);const y=canvas.height-38;
    const actual=canvas.getContext('2d').getImageData(0,y,355,14).data;
    for(let i=0,p=0;i<actual.length;i+=4,p+=3){const k=y*355*3+p;if(actual[i]!==expected.pixels[k]||actual[i+1]!==expected.pixels[k+1]||actual[i+2]!==expected.pixels[k+2])return false;}
    return canvas.height===32138;
  })()`),true);
  // Restore a normal-length example for export and visual inspection.
  await generate({company:'FINE NAME',startTime:'08:00',endTime:'15:30',interval:'15'});
  assert.equal(getReport().count,31);assert.equal(getReport().layout.height,1074);
  const series=JSON.stringify(getReport().readings);
  await generate({company:'FINE NAME'});assert.notEqual(JSON.stringify(getReport().readings),series);
  const frozen=JSON.stringify(getReport().readings);
  await js(`document.getElementById('zoom').value='1.5';document.getElementById('zoom').dispatchEvent(new Event('change'));`);
  assert.equal(await js(`document.getElementById('receipt-canvas').style.height`),'1611px');
  await js(`document.getElementById('zoom').value='1';document.getElementById('zoom').dispatchEvent(new Event('change'));`);
  canceled=false;await save();assert.equal(JSON.stringify(getReport().readings),frozen);
  const bytes=fs.readFileSync(destination).toString('latin1');assert.equal((bytes.match(/\/Type \/Page\b/g)||[]).length,1);
  await js(`document.getElementById('toast').hidden=true`);
  await new Promise(resolve=>setTimeout(resolve,200));
  fs.writeFileSync(path.join(directory,'electron-ui.png'),(await window.webContents.capturePage()).toPNG());
  await js(`document.getElementById('preview-scroll').scrollTop=document.getElementById('preview-scroll').scrollHeight`);
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(await js(`(()=>{const e=document.getElementById('preview-scroll');return Math.abs(e.scrollHeight-e.clientHeight-e.scrollTop)<=1;})()`),true);
  fs.writeFileSync(path.join(directory,'electron-ui-bottom.png'),(await window.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(directory,'electron-report.json'),JSON.stringify(getReport(),null,2));
  const result={count:31,pdfPages:1,receiptHeight:1074,longestPreviewHeight:32138,independentSensorRanges:true,endpointsExcluded:true,max15MinuteDifference:0.5,regenerationChangesReadings:true,exportPreservesReadings:true,darkThemeVerified:true,unnecessaryCopyRemoved:true,companiesTested:['VELTO TRANS','FINE NAME'],bitmapPreviewMatchesExport:true,exportButtonSavedPdf:true,cancellationHandled:true,staleExportRejected:true,dirtyInputsDisableExport:true,paginationRemoved:true,fullReceiptScrollsToLastReading:true,nodeUnavailableToRenderer:true};
  fs.writeFileSync(path.join(directory,'electron-result.json'),JSON.stringify(result,null,2));
  return result;
};
