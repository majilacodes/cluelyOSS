const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => ipcRenderer.on(channel, (_event, data) => callback(data));

contextBridge.exposeInMainWorld('api', {
  capture: (mode) => ipcRenderer.invoke('capture', mode),
  ask: (id, thread) => ipcRenderer.invoke('ask', id, thread),
  cancel: (id) => ipcRenderer.invoke('cancel', id),
  hide: () => ipcRenderer.invoke('hide'),
  quit: () => ipcRenderer.invoke('quit'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  resetUsage: () => ipcRenderer.invoke('usage:reset'),
  setOpacity: (value, persist) => ipcRenderer.invoke('opacity', value, persist),
  onScreenshot: on('screenshot'),
  onCaptureError: on('capture-error'),
  onAnswerChunk: on('answer-chunk'),
});
