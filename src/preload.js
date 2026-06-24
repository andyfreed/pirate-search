'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  search: (query, cat) => ipcRenderer.invoke('search', { query, cat }),
  qbDetect: () => ipcRenderer.invoke('qb-detect'),
  openInQb: (magnet) => ipcRenderer.invoke('open-in-qb', { magnet }),
  openMagnet: (magnet) => ipcRenderer.invoke('open-magnet', { magnet }),
  copy: (text) => ipcRenderer.invoke('copy', { text }),
  qbWebAdd: (opts) => ipcRenderer.invoke('qb-web-add', opts),
});
