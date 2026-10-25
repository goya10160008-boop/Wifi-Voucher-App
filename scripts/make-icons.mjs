// Draws a simple WiFi-arc icon as PNG with no dependencies. Run: node scripts/make-icons.mjs
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

function png(size, safe) { // safe = fraction of canvas the glyph may use (maskable needs ~0.6)
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2, cy = size * (0.5 + 0.18 * safe), unit = size * safe / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy), up = y < cy;
      let white = d < unit * 0.1; // dot
      for (const r of [0.45, 0.75, 1.05]) if (up && Math.abs(d - unit * r) < unit * 0.09 && Math.abs(x - cx) < (cy - y) * 1.0) white = true;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const [r, g, b] = white ? [255, 255, 255] : [29, 78, 216];
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/icons/icon-192.png', png(192, 0.8));
writeFileSync('public/icons/icon-512.png', png(512, 0.8));
writeFileSync('public/icons/maskable-512.png', png(512, 0.55));
writeFileSync('public/icons/apple-icon.png', png(180, 0.8));
