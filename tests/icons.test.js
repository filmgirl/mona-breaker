import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAP, PNG_ICONS, png, svg } from '../scripts/icons.mjs';
import { PUBLISHED } from '../scripts/serve.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root));
const pngSize = (buf) => {
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
};

test('committed icons match the pixel map (run npm run icons after editing it)', async () => {
  assert.equal((await read('assets/favicon.svg')).toString(), svg());
  for (const icon of PNG_ICONS) assert.ok((await read(`assets/${icon.file}`)).equals(png(icon)), icon.file);
});

test('manifest is installable and every icon exists at its declared size', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  for (const field of ['name', 'short_name', 'start_url', 'display', 'background_color', 'theme_color']) assert.ok(manifest[field], field);
  assert.equal(manifest.start_url, './', 'relative so it works under /mona-breaker/');
  for (const size of ['192x192', '512x512']) {
    for (const purpose of ['any', 'maskable']) {
      assert.ok(manifest.icons.some((i) => i.sizes === size && i.purpose === purpose && i.type === 'image/png'), `${purpose} ${size}`);
    }
  }
  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\.\/assets\//);
    const file = await read(icon.src);
    if (icon.type === 'image/png') assert.deepEqual(pngSize(file), icon.sizes.split('x').map(Number), icon.src);
  }
  assert.ok(PUBLISHED.includes('manifest.webmanifest'), 'manifest is deployed');
});

test('maskable icons keep Mona inside the 80% safe zone; Apple icon is opaque', () => {
  let minX = 16, minY = 16, maxX = 0, maxY = 0;
  MAP.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || ch === 'l') return;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + 1); maxY = Math.max(maxY, y + 1);
  }));
  assert.ok(PNG_ICONS.find((i) => i.file === 'apple-touch-icon.png').opaque, 'iOS renders transparency as black');
  for (const { file, cell, pad } of PNG_ICONS.filter((i) => i.file.includes('maskable'))) {
    const size = 16 * cell + 2 * pad, c = size / 2, r = size * 0.4;
    for (const [x, y] of [[minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY]]) {
      assert.ok(Math.hypot(pad + x * cell - c, pad + y * cell - c) <= r, `${file} corner ${x},${y}`);
    }
  }
});

test('index.html links the manifest, Apple icon and theme colors', async () => {
  const html = (await read('index.html')).toString();
  for (const tag of ['rel="manifest" href="./manifest.webmanifest"', 'rel="apple-touch-icon" href="./assets/apple-touch-icon.png"', 'name="theme-color"']) {
    assert.ok(html.includes(tag), tag);
  }
});
