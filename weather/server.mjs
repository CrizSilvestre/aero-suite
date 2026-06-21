// Minimal static server (dev/preview only). Serves this folder with correct
// MIME types — notably .mjs as text/javascript so ES modules load.
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4178;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.map': 'application/json', '.wasm': 'application/wasm', '.ico': 'image/x-icon',
};

// POST /api/open-eml — saves the .eml to a temp file and opens it with the OS
// default handler (Outlook on macOS/Windows).  Only works when running locally.
async function handleOpenEml(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('utf8');
  if (!body) { res.writeHead(400).end('empty body'); return; }
  const file = join(tmpdir(), `Weather-${Date.now()}.eml`);
  await writeFile(file, body, 'utf8');
  const cmd = process.platform === 'win32' ? 'start' : 'open';
  execFile(cmd, [file], (err) => {
    if (err) console.error('open failed:', err.message);
  });
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, file }));
}

createServer(async (req, res) => {
  try {
    // API routes
    if (req.method === 'POST' && req.url === '/api/open-eml') {
      return handleOpenEml(req, res);
    }

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
}).listen(PORT, () => console.log(`aeroweather on http://localhost:${PORT}`));
