// Servidor local (dev/preview). Sirve esta carpeta con MIME correcto y expone
// POST /api/open-eml para autolanzar Outlook (igual que AeroWeather).
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4179;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.wasm': 'application/wasm',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

async function handleOpenEml(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('utf8');
  if (!body) { res.writeHead(400).end('empty'); return; }
  const file = join(tmpdir(), `AIPC-${Date.now()}.eml`);
  await writeFile(file, body, 'utf8');
  execFile(process.platform === 'win32' ? 'start' : 'open', [file], (err) => {
    if (err) console.error('open failed:', err.message);
  });
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
}

createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/open-eml') return handleOpenEml(req, res);
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p === '') p = '/index.html';
    let fp = normalize(join(ROOT, p));
    if (!fp.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    const s = await stat(fp);
    if (s.isDirectory()) fp = join(fp, 'index.html');
    const data = await readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
}).listen(PORT, () => console.log(`aipc-planner on http://localhost:${PORT}`));
