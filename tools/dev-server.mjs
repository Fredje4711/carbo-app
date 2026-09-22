import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import analysisHandler from '../api/proxy.js';
import whisperHandler from '../api/whisper.js';
import { relayToVercel } from './vercel-relay.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.includes('--demo')) throw new Error('De oude demo is verwijderd. Start zonder --demo voor echte analyse via Vercel.');
const port = Number(process.env.PORT || 4174);
const localApi = process.argv.includes('--local-api');
process.env.ALLOWED_ORIGINS = [process.env.ALLOWED_ORIGINS, `http://localhost:${port}`, `http://127.0.0.1:${port}`].filter(Boolean).join(',');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url)));
createServer(async (req, res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    for (const header of config.headers[0].headers) res.setHeader(header.key, header.value);
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname.startsWith('/api/')) {
      const origin = req.headers.origin;
      if (origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(origin)) return res.status(403).json({ error: 'Alleen de lokale app mag deze route gebruiken.' });
      if (!localApi) return await relayToVercel(req, res, url.pathname);
      if (url.pathname === '/api/proxy') {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 6_000_000) { res.status(413).json({ error: 'Aanvraag te groot.' }); return; } chunks.push(chunk); }
        if (url.pathname === '/api/proxy') { try { req.body = JSON.parse(Buffer.concat(chunks).toString()); } catch { res.status(400).json({ error: 'Ongeldige JSON.' }); return; } }
      }
      if (url.pathname === '/api/proxy') return await analysisHandler(req, res);
      if (url.pathname === '/api/whisper') return await whisperHandler(req, res);
      return res.status(404).json({ error: 'Onbekende functie.' });
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.end(); return; }
    const path = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const full = resolve(root, `.${path}`);
    // Only application assets are served; never source tooling, credentials, Git or dependencies.
    if (!full.startsWith(root) || path.split(/[\\/]/).some(part => part.startsWith('.')) || !types[extname(full)] || /[\\/](api|test|tools|node_modules)[\\/]/.test(path) || /[\\/]lib[\\/](server|rate-limit)\.js$/.test(path)) { res.statusCode = 404; res.end(); return; }
    let content = await readFile(full);
    res.setHeader('Content-Type', types[extname(full)]);
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) { if (!res.headersSent) res.statusCode = error.code === 'ENOENT' ? 404 : 500; res.end('Niet beschikbaar.'); }
}).listen(port, '127.0.0.1', () => console.log(`Lokale app met echte analyse (${localApi ? 'lokale API' : 'via Vercel'}): http://127.0.0.1:${port}`));
