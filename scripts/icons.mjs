// Generates the favicon and app icons from one 16x16 pixel map, so every size stays
// pixel-crisp. Dependency-free: run `npm run icons` after editing the map.
import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const COLORS = { k: '#34313e', i: '#fffdf4', l: '#ded4f1', L: '#b6a3d2', p: '#6f5a9a', c: '#ffb7a5' };
const BACKGROUND = 'l';
// Pixel Mona over a paddle. '.' is transparent (rounded tile corners).
export const MAP = [
  '.llllllllllllll.',
  'lllkkllllllkklll',
  'lllkkkllllkkklll',
  'lllkkkkkkkkkklll',
  'llkkkkkkkkkkkkll',
  'llkkiiiiiiiikkll',
  'llkiiiiiiiiiikll',
  'llkiikkiikkiikll',
  'llkiikkiikkiikll',
  'llkiciiiiiicikll',
  'llkkiiiiiiiikkll',
  'llkkkkkkkkkkkkll',
  'lllkkkkkkkkkklll',
  'llllllllllllllll',
  'llpLLLLLLLLLLpll',
  '.llllllllllllll.',
];

// Each PNG uses an integer cell size, so no pixel is resampled. Maskable and Apple
// icons are opaque and padded; their artwork sits within the maskable 80% safe zone.
export const PNG_ICONS = [
  { file: 'icon-192.png', cell: 12, pad: 0, opaque: false },
  { file: 'icon-512.png', cell: 32, pad: 0, opaque: false },
  { file: 'icon-maskable-192.png', cell: 8, pad: 32, opaque: true },
  { file: 'icon-maskable-512.png', cell: 22, pad: 80, opaque: true },
  { file: 'apple-touch-icon.png', cell: 9, pad: 18, opaque: true },
];

function check() {
  if (MAP.length !== 16 || MAP.some((row) => row.length !== 16)) throw new Error('MAP must be 16x16.');
  for (const row of MAP) for (const ch of row) if (ch !== '.' && !COLORS[ch]) throw new Error(`Unknown color "${ch}".`);
}

export function svg() {
  const paths = new Map();
  MAP.forEach((row, y) => {
    for (let x = 0; x < 16;) {
      const ch = row[x];
      let w = 1;
      while (x + w < 16 && row[x + w] === ch) w += 1;
      if (ch !== '.') paths.set(ch, (paths.get(ch) ?? '') + `M${x} ${y}h${w}v1h-${w}z`);
      x += w;
    }
  });
  const body = [...paths].map(([ch, d]) => `<path fill="${COLORS[ch]}" d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><title>Mona Breaker: pixel Octocat over a paddle</title>${body}</svg>\n`;
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
const rgba = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255);

export function png({ cell, pad, opaque }) {
  const size = 16 * cell + 2 * pad;
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const bg = opaque ? rgba(COLORS[BACKGROUND]) : [0, 0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mx = Math.floor((x - pad) / cell), my = Math.floor((y - pad) / cell);
      const ch = mx >= 0 && mx < 16 && my >= 0 && my < 16 ? MAP[my][mx] : '.';
      const color = ch === '.' ? bg : rgba(COLORS[ch]);
      raw.set(color, y * stride + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  check();
  const dir = new URL('../assets/', import.meta.url);
  await writeFile(new URL('favicon.svg', dir), svg());
  for (const icon of PNG_ICONS) await writeFile(new URL(icon.file, dir), png(icon));
  console.log(`Wrote favicon.svg and ${PNG_ICONS.map((i) => i.file).join(', ')} to assets/`);
}
