// Draws the A&B WiFi mark (white WiFi arcs + "A&B" on Mint green) as PNG, no dependencies.
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
};

// 5x7 pixel glyphs for "A&B".
const GLYPHS = [
  ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
];
const TEXT_W = 0.6, CELL = TEXT_W / 17, TEXT_X = (1 - TEXT_W) / 2, TEXT_Y = 0.66;

// u, v in [0,1] inside the safe box. True where the mark is white.
function mark(u, v) {
  const cx = 0.5, cy = 0.52;
  const d = Math.hypot(u - cx, v - cy);
  if (d < 0.05) return true; // dot
  if (v < cy && Math.abs(u - cx) < cy - v) for (const r of [0.17, 0.3, 0.43]) if (Math.abs(d - r) < 0.03) return true;
  const col = Math.floor((u - TEXT_X) / CELL), row = Math.floor((v - TEXT_Y) / CELL);
  if (row < 0 || row > 6 || col < 0 || col > 16) return false;
  const g = Math.floor(col / 6), gc = col % 6;
  return gc < 5 && GLYPHS[g]?.[row][gc] === '1';
}

const BG = [22, 101, 52]; // --color-pri #166534
const SS = 3; // samples per axis for smooth edges

function png(size, safe) { // safe = fraction of the canvas the mark may use (maskable needs ~0.6)
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const box = size * safe, off = (size - box) / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        if (mark((x + (sx + 0.5) / SS - off) / box, (y + (sy + 0.5) / SS - off) / box)) hit++;
      }
      const a = hit / (SS * SS), o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] * (1 - a) + 255 * a);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/icons/icon-192.png', png(192, 0.84));
writeFileSync('public/icons/icon-512.png', png(512, 0.84));
writeFileSync('public/icons/maskable-512.png', png(512, 0.6));
writeFileSync('public/icons/apple-icon.png', png(180, 0.84));
