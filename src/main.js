'use strict';
const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const { parseResults } = require('./lib/torrents');

const APIBAY = 'https://apibay.org';

function findQbittorrent() {
  const candidates = [
    'C:\\Program Files\\qBittorrent\\qbittorrent.exe',
    'C:\\Program Files (x86)\\qBittorrent\\qbittorrent.exe',
  ];
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'qBittorrent', 'qbittorrent.exe'));
  }
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 800,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#0d1626',
    title: 'Pirate Search',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdate();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------- auto-update
function sendUpdate(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('update-status', payload);
}

function setupAutoUpdate() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => sendUpdate({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (info) => sendUpdate({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => sendUpdate({ state: 'error', message: String(err && err.message ? err.message : err) }));

  // Only check in the installed/packaged app (dev runs have no update feed).
  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000);
  }
}

// ---------------------------------------------------------------- IPC handlers
ipcMain.handle('get-version', async () => app.getVersion());

ipcMain.handle('check-updates', async () => {
  if (!app.isPackaged) return { dev: true };
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('install-update', async () => {
  setImmediate(() => autoUpdater.quitAndInstall());
  return { ok: true };
});

ipcMain.handle('search', async (_e, { query, cat }) => {
  const q = encodeURIComponent((query || '').trim());
  const c = encodeURIComponent(cat || '0');
  if (!q) return [];
  const url = `${APIBAY}/q.php?q=${q}&cat=${c}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PirateSearch/1.0' } });
  if (!res.ok) throw new Error('apibay HTTP ' + res.status);
  return parseResults(await res.json());
});

// Top 100 / browse via apibay's precompiled lists.
ipcMain.handle('top100', async (_e, { cat }) => {
  const file = cat === 'recent' ? 'data_top100_recent.json' : `data_top100_${cat}.json`;
  const url = `${APIBAY}/precompiled/${file}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PirateSearch/1.0' } });
  if (!res.ok) throw new Error('apibay HTTP ' + res.status);
  return parseResults(await res.json());
});

ipcMain.handle('qb-detect', async () => ({ path: findQbittorrent() }));

ipcMain.handle('open-in-qb', async (_e, { magnet }) => {
  const qb = findQbittorrent();
  if (!qb) {
    await shell.openExternal(magnet);
    return { ok: true, via: 'default-handler' };
  }
  const child = spawn(qb, [magnet], { detached: true, stdio: 'ignore' });
  child.unref();
  return { ok: true, via: 'qbittorrent' };
});

ipcMain.handle('open-magnet', async (_e, { magnet }) => {
  await shell.openExternal(magnet);
  return { ok: true };
});

ipcMain.handle('copy', async (_e, { text }) => {
  clipboard.writeText(text || '');
  return { ok: true };
});

ipcMain.handle('qb-web-add', async (_e, { magnet, host, port, username, password }) => {
  const base = `http://${host}:${port}`;

  const loginRes = await fetch(`${base}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: base },
    body: new URLSearchParams({ username: username || '', password: password || '' }).toString(),
  });
  if (loginRes.status === 403) {
    throw new Error('qBittorrent temporarily banned this IP after failed logins — restart qBittorrent and retry.');
  }
  const loginText = (await loginRes.text()).trim();
  if (loginText && loginText !== 'Ok.') {
    throw new Error('Login rejected: ' + loginText + ' (check username/password and that Web UI is enabled).');
  }

  let cookie = '';
  const setCookie = loginRes.headers.get('set-cookie');
  if (setCookie) {
    const m = /SID=([^;]+)/.exec(setCookie);
    if (m) cookie = 'SID=' + m[1];
  }

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Referer: base };
  if (cookie) headers.Cookie = cookie;
  const addRes = await fetch(`${base}/api/v2/torrents/add`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ urls: magnet }).toString(),
  });
  const addText = (await addRes.text()).trim();
  if (!addRes.ok || (addText && addText !== 'Ok.')) {
    throw new Error('Add failed (HTTP ' + addRes.status + '): ' + (addText || 'no response'));
  }
  return { ok: true };
});
