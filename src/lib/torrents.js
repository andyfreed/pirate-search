'use strict';
// Pure helpers — no Electron deps so they can be unit-tested with plain node.

// A solid set of public trackers so magnets resolve well in any client.
const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://opentracker.i2p.rocks:6969/announce',
  'udp://tracker.internetwarriors.net:1337/announce',
  'udp://9.rarbg.to:2710/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://open.demonii.com:1337/announce',
];

function buildMagnet(infoHash, name) {
  const trackers = TRACKERS.map((t) => '&tr=' + encodeURIComponent(t)).join('');
  return `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${trackers}`;
}

function categoryLabel(code) {
  const c = parseInt(code, 10) || 0;
  const top = Math.floor(c / 100) * 100;
  const map = { 100: 'Audio', 200: 'Video', 300: 'Applications', 400: 'Games', 500: 'Adult', 600: 'Other' };
  return map[top] || 'Other';
}

function formatSize(bytes) {
  let n = Number(bytes) || 0;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  const decimals = i === 0 || n >= 100 ? 0 : 1;
  return `${n.toFixed(decimals)} ${u[i]}`;
}

function formatDate(unix) {
  const d = new Date(Number(unix) * 1000);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// apibay returns a single placeholder row when there are no matches.
function parseResults(json) {
  if (!Array.isArray(json)) return [];
  if (json.length === 1 && (json[0].id === '0' || json[0].name === 'No results returned')) return [];
  return json.map((r) => ({
    id: r.id,
    name: r.name,
    infoHash: r.info_hash,
    seeders: Number(r.seeders) || 0,
    leechers: Number(r.leechers) || 0,
    size: Number(r.size) || 0,
    sizeText: formatSize(r.size),
    files: Number(r.num_files) || 0,
    username: r.username || '',
    added: formatDate(r.added),
    category: r.category,
    categoryText: categoryLabel(r.category),
    status: r.status || '',
    imdb: r.imdb || '',
    magnet: buildMagnet(r.info_hash, r.name),
  }));
}

module.exports = { TRACKERS, buildMagnet, categoryLabel, formatSize, formatDate, parseResults };
