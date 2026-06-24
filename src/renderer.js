'use strict';

const $ = (sel) => document.querySelector(sel);

const els = {
  form: $('#searchForm'),
  query: $('#query'),
  category: $('#category'),
  searchBtn: $('#searchBtn'),
  settingsBtn: $('#settingsBtn'),
  settings: $('#settings'),
  status: $('#status'),
  table: $('#resultsTable'),
  results: $('#results'),
  qbHost: $('#qbHost'),
  qbPort: $('#qbPort'),
  qbUser: $('#qbUser'),
  qbPass: $('#qbPass'),
  saveSettings: $('#saveSettings'),
  qbStatus: $('#qbStatus'),
  qbDetect: $('#qbDetect'),
};

const SETTINGS_KEY = 'pirateSearch.qb';
let currentRows = [];
let sortKey = 'seeders';
let sortDir = -1; // -1 desc, 1 asc

// ---------------------------------------------------------------- settings
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (s.host) els.qbHost.value = s.host;
    if (s.port) els.qbPort.value = s.port;
    if (s.user) els.qbUser.value = s.user;
    if (typeof s.pass === 'string') els.qbPass.value = s.pass;
  } catch (_) {
    /* ignore */
  }
}
function getSettings() {
  return {
    host: els.qbHost.value.trim() || 'localhost',
    port: els.qbPort.value.trim() || '8080',
    username: els.qbUser.value.trim(),
    password: els.qbPass.value,
  };
}
function saveSettings() {
  const s = getSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ host: s.host, port: s.port, user: s.username, pass: s.password }));
  els.qbStatus.textContent = 'Saved.';
  els.qbStatus.className = 'qb-status ok-text';
  setTimeout(() => (els.qbStatus.textContent = ''), 2500);
}

// ---------------------------------------------------------------- helpers
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setStatus(msg, kind) {
  els.status.textContent = msg;
  els.status.className = 'status' + (kind ? ' ' + kind : '');
  els.status.classList.remove('hidden');
}

function flash(btn, text, ok) {
  const original = btn.textContent;
  btn.textContent = text;
  btn.classList.add(ok ? 'ok-text' : 'bad-text');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('ok-text', 'bad-text');
  }, 1600);
}

// ---------------------------------------------------------------- rendering
function sortRows(rows) {
  const r = rows.slice();
  r.sort((a, b) => {
    let av = a[sortKey];
    let bv = b[sortKey];
    if (typeof av === 'string') {
      av = av.toLowerCase();
      bv = bv.toLowerCase();
      return av < bv ? sortDir : av > bv ? -sortDir : 0;
    }
    return (av - bv) * sortDir;
  });
  return r;
}

function render() {
  const rows = sortRows(currentRows);
  els.results.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-name">
        <div class="name-text">${escapeHtml(row.name)}</div>
        <div class="name-sub">${escapeHtml(row.files)} file(s) &middot; by ${escapeHtml(row.username || 'anon')}${
      row.status === 'vip' ? ' &middot; VIP' : row.status === 'trusted' ? ' &middot; Trusted' : ''
    }</div>
      </td>
      <td><span class="cat-pill">${escapeHtml(row.categoryText)}</span></td>
      <td class="num">${escapeHtml(row.sizeText)}</td>
      <td class="num seed">${row.seeders}</td>
      <td class="num leech">${row.leechers}</td>
      <td>${escapeHtml(row.added)}</td>
      <td class="col-actions">
        <div class="actions">
          <button class="btn-qb" title="Open in your installed qBittorrent">qB</button>
          <button class="btn-web" title="Send to qBittorrent Web UI">Web</button>
          <button class="btn-copy" title="Copy magnet link">Copy</button>
        </div>
      </td>`;

    const [qbBtn, webBtn, copyBtn] = tr.querySelectorAll('button');
    qbBtn.addEventListener('click', () => openInQb(row, qbBtn));
    webBtn.addEventListener('click', () => sendWeb(row, webBtn));
    copyBtn.addEventListener('click', () => copyMagnet(row, copyBtn));
    frag.appendChild(tr);
  }

  els.results.appendChild(frag);
  els.table.classList.remove('hidden');
  els.status.classList.add('hidden');
  updateSortIndicators();
}

function updateSortIndicators() {
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    const base = th.textContent.replace(/[ ▲▼]+$/, '');
    th.textContent = base + (th.dataset.sort === sortKey ? (sortDir === -1 ? ' ▼' : ' ▲') : '');
  });
}

// ---------------------------------------------------------------- actions
async function doSearch(e) {
  if (e) e.preventDefault();
  const query = els.query.value.trim();
  if (!query) {
    setStatus('Type something to search.');
    return;
  }
  els.searchBtn.disabled = true;
  setStatus('Searching for "' + query + '"…');
  els.table.classList.add('hidden');
  try {
    currentRows = await window.api.search(query, els.category.value);
    if (!currentRows.length) {
      setStatus('No results for "' + query + '".');
      return;
    }
    sortKey = 'seeders';
    sortDir = -1;
    render();
  } catch (err) {
    setStatus('Search failed: ' + (err && err.message ? err.message : err), 'bad-text');
  } finally {
    els.searchBtn.disabled = false;
  }
}

async function openInQb(row, btn) {
  try {
    const r = await window.api.openInQb(row.magnet);
    flash(btn, r.via === 'qbittorrent' ? 'Sent' : 'Opened', true);
  } catch (err) {
    flash(btn, 'Err', false);
    setStatus('Could not open in qBittorrent: ' + err.message, 'bad-text');
  }
}

async function sendWeb(row, btn) {
  const s = getSettings();
  btn.disabled = true;
  try {
    await window.api.qbWebAdd(Object.assign({ magnet: row.magnet }, s));
    flash(btn, 'Added', true);
  } catch (err) {
    flash(btn, 'Fail', false);
    setStatus('Web UI add failed: ' + err.message, 'bad-text');
  } finally {
    btn.disabled = false;
  }
}

async function copyMagnet(row, btn) {
  await window.api.copy(row.magnet);
  flash(btn, 'Copied', true);
}

// ---------------------------------------------------------------- wiring
els.form.addEventListener('submit', doSearch);
els.settingsBtn.addEventListener('click', () => els.settings.classList.toggle('hidden'));
els.saveSettings.addEventListener('click', saveSettings);

document.querySelectorAll('th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (key === sortKey) sortDir = -sortDir;
    else {
      sortKey = key;
      sortDir = typeof currentRows[0]?.[key] === 'string' ? 1 : -1;
    }
    render();
  });
});

(async function init() {
  loadSettings();
  try {
    const d = await window.api.qbDetect();
    if (d && d.path) {
      els.qbDetect.textContent = '✓ qBittorrent detected';
      els.qbDetect.className = 'detect ok';
    } else {
      els.qbDetect.textContent = '! qBittorrent not found — magnets open in your default torrent app';
      els.qbDetect.className = 'detect bad';
    }
  } catch (_) {
    /* ignore */
  }
})();
