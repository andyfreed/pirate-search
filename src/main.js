'use strict';
const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
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
    height: 780,
    minWidth: 840,
    minHeight: 540,
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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------- IPC handlers

ipcMain.handle('search', async (_e, { query, cat }) => {
  const q = encodeURIComponent((query || '').trim());
  const c = encodeURIComponent(cat || '0');
  if (!q) return [];
  const url = `${APIBAY}/q.php?q=${q}&cat=${c}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PirateSearch/1.0' } });
  if (!res.ok) throw new Error('apibay HTTP ' + res.status);
  const json = await res.json();
  return parseResults(json);
});

ipcMain.handle('qb-detect', async () => ({ path: findQbittorrent() }));

// Hand the magnet straight to the installed qBittorrent client.
ipcMain.handle('open-in-qb', async (_e, { magnet }) => {
  const qb = findQbittorrent();
  if (!qb) {
    await shell.openExternal(magnet); // fall back to the OS default magnet handler
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

// Push the magnet to a running qBittorrent Web UI (Tools > Options > Web UI).
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
