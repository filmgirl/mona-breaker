// Loopback-only static preview server. Serves the game exactly as GitHub Pages will.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const PUBLISHED = ['index.html', 'style.css', 'src', 'vendor', 'assets'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
};

export function resolvePublished(baseDir, urlPath) {
  let path = decodeURIComponent(urlPath.split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const relative = normalize(path).replace(/^([/\\])+/, '');
  if (relative.startsWith('..') || relative.includes(`${sep}..`)) return null;
  if (!PUBLISHED.some(entry => relative === entry || relative.startsWith(`${entry}${sep}`) || relative.startsWith(`${entry}/`))) return null;
  return join(baseDir, relative);
}

export function handler(baseDir) {
  return async (req, res) => {
    const file = resolvePublished(baseDir, req.url);
    try {
      if (!file || !(await stat(file)).isFile()) throw new Error('not found');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = process.env.PORT ?? '4179';
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  createServer(handler(root)).listen(Number(text), '127.0.0.1', () => {
    console.log(`Mona Breaker is ready at http://127.0.0.1:${text}/`);
  });
}
