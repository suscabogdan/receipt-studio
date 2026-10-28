'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('receiptApp', Object.freeze({
  loadSettings: () => ipcRenderer.invoke('receipt:load-settings'),
  generatePreview: input => ipcRenderer.invoke('receipt:generate', input),
  exportPdf: id => ipcRenderer.invoke('receipt:export-pdf', id)
}));
