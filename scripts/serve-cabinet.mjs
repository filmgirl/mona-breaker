// Same-origin harness like GitHub Pages: the real cabinet at /arcade/, the staged game at /mona-breaker/.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { cabinetRoot, cabinetSha, candidateCatalog, origin, port, siteRoot, verifyCabinet } from './cabinet.mjs';

verifyCabinet();
await readFile(resolve(siteRoot, 'index.html'));
const catalog = candidateCatalog(JSON.parse(await readFile(resolve(cabinetRoot, 'games.json'), 'utf8')));
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.txt': 'text/plain',
};

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
    res.setHeader('Cache-Control', 'no-store');
    if (pathname === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ cabinetSha })); return; }
    if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (pathname === '/arcade/games.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(catalog)); return; }
    const mount = [['/arcade/', cabinetRoot], ['/mona-breaker/', siteRoot]].find(([prefix]) => pathname.startsWith(prefix));
    if (!mount) { res.writeHead(404).end('Not found'); return; }
    const [prefix, base] = mount;
    const file = resolve(base, pathname.slice(prefix.length) || 'index.html');
    if (!file.startsWith(base + sep) || file.includes(`${sep}.git`)) { res.writeHead(403).end('Forbidden'); return; }
    const body = await readFile(file);
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') res.writeHead(404).end('Not found');
    else { console.error(error); res.writeHead(500).end('Harness error'); }
  }
}).listen(port, '127.0.0.1', () => console.log(`Cabinet harness: ${origin}/arcade/`));
