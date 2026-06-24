'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  search: (query, cat) => ipcRenderer.invoke('search', { query, cat }),
  top100: (cat) => ipcRenderer.invoke('top100', { cat }),
  qbDetect: () => ipcRenderer.invoke('qb-detect'),
  openInQb: (magnet) => ipcRenderer.invoke('open-in-qb', { magnet }),
  openMagnet: (magnet) => ipcRenderer.invoke('open-magnet', { magnet }),
  copy: (text) => ipcRenderer.invoke('copy', { text }),
  qbWebAdd: (opts) => ipcRenderer.invoke('qb-web-add', opts),
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, data) => cb(data)),
});
