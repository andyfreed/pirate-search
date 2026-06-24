'use strict';
// Generates build/icon.ico and build/icon.png (256x256 skull & crossbones)
// with no external dependencies — pure Node (zlib only). Supersampled for clean edges.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const SS = 4; // 4x4 supersampling

// ---- geometry helpers ----------------------------------------------------
function roundRectDist(x, y, cx, cy, hw, hh, r) {
  const dx = Math.max(Math.abs(x - cx) - (hw - r), 0);
  const dy = Math.max(Math.abs(y - cy) - (hh - r), 0);
  return Math.sqrt(dx * dx + dy * dy) - r; // <0 inside
}
function circle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function distToSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy || 1;
  let t = (wx * vx + wy * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  return Math.hypot(px - cx, py - cy);
}

// ---- colors --------------------------------------------------------------
const BONE = [241, 244, 248];
function bg(y) {
  const t = y / SIZE;
  const top = [27, 42, 74];
  const bot = [10, 18, 33];
  return [Math.round(top[0] + (bot[0] - top[0]) * t), Math.round(top[1] + (bot[1] - top[1]) * t), Math.round(top[2] + (bot[2] - top[2]) * t)];
}
const FEATURE = [9, 16, 28];

// crossbone capsules (drawn behind the skull)
const bones = [
  { a: [52, 52], b: [204, 204], perp: [1, -1] },
  { a: [204, 52], b: [52, 204], perp: [1, 1] },
];
function onBone(x, y) {
  for (const bn of bones) {
    if (distToSeg(x, y, bn.a[0], bn.a[1], bn.b[0], bn.b[1]) < 14) return true;
    const pl = Math.hypot(bn.perp[0], bn.perp[1]);
    const px = bn.perp[0] / pl;
    const py = bn.perp[1] / pl;
    for (const end of [bn.a, bn.b]) {
      if (circle(x, y, end[0] + px * 11, end[1] + py * 11, 13)) return true;
      if (circle(x, y, end[0] - px * 11, end[1] - py * 11, 13)) return true;
    }
  }
  return false;
}

function inSkull(x, y) {
  if (circle(x, y, 128, 116, 70)) return true; // cranium
  if (roundRectDist(x, y, 128, 178, 46, 30, 16) < 0) return true; // jaw
  return false;
}

function inFeatures(x, y) {
  if (circle(x, y, 104, 110, 19)) return true; // left eye
  if (circle(x, y, 152, 110, 19)) return true; // right eye
  if (circle(x, y, 128, 146, 10)) return true; // nose
  // teeth: a separating gap plus three vertical gaps
  if (Math.abs(y - 160) < 2.4 && Math.abs(x - 128) < 42) return true;
  if (y > 160 && y < 198) {
    if (Math.abs(x - 114) < 2.2 || Math.abs(x - 128) < 2.2 || Math.abs(x - 142) < 2.2) return true;
  }
  return false;
}

// ---- sample one (sub)pixel; returns [r,g,b,a] ----------------------------
function sample(x, y) {
  if (roundRectDist(x, y, 128, 128, 128, 128, 46) >= 0) return [0, 0, 0, 0];
  let col = bg(y);
  if (onBone(x, y)) col = BONE;
  if (inSkull(x, y)) col = BONE;
  if (inFeatures(x, y) && (inSkull(x, y) || true)) {
    // only carve features where they sit on the skull/face area
    if (inSkull(x, y)) col = FEATURE;
  }
  return [col[0], col[1], col[2], 255];
}

// ---- render with supersampling ------------------------------------------
const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const fx = x + (sx + 0.5) / SS;
        const fy = y + (sy + 0.5) / SS;
        const s = sample(fx, fy);
        // premultiply for correct edge blending
        const af = s[3] / 255;
        r += s[0] * af;
        g += s[1] * af;
        b += s[2] * af;
        a += s[3];
      }
    }
    const n = SS * SS;
    const aOut = a / n;
    const off = (y * SIZE + x) * 4;
    if (aOut === 0) {
      rgba[off] = rgba[off + 1] = rgba[off + 2] = rgba[off + 3] = 0;
    } else {
      const aN = aOut / 255;
      rgba[off] = Math.round(r / n / aN);
      rgba[off + 1] = Math.round(g / n / aN);
      rgba[off + 2] = Math.round(b / n / aN);
      rgba[off + 3] = Math.round(aOut);
    }
  }
}

// ---- PNG encoding --------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function makePng(width, height, data) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- ICO (single 256px PNG entry; valid on Windows Vista+) ---------------
function makeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256 (0 means 256)
  entry[1] = 0; // height 256
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // offset
  return Buffer.concat([header, entry, png]);
}

const png = makePng(SIZE, SIZE, rgba);
const outDir = path.join(__dirname, 'build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
fs.writeFileSync(path.join(outDir, 'icon.ico'), makeIco(png));
console.log('Wrote build/icon.png (' + png.length + ' bytes) and build/icon.ico');
