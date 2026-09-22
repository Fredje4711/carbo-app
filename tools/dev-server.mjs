import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import analysisHandler from '../api/proxy.js';
import whisperHandler from '../api/whisper.js';
import { meal, noMeal } from '../test/fixtures.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const demo = process.argv.includes('--demo');
const port = Number(process.env.PORT || (demo ? 4174 : 4173));
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
      if (url.pathname === '/api/proxy' || demo) {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 6_000_000) { res.status(413).json({ error: 'Aanvraag te groot.' }); return; } chunks.push(chunk); }
        if (url.pathname === '/api/proxy') { try { req.body = JSON.parse(Buffer.concat(chunks).toString()); } catch { res.status(400).json({ error: 'Ongeldige JSON.' }); return; } }
      }
      if (demo) {
        // Only the explicit local demo process returns fixtures. Never deployed or forwarded.
        const description = req.body?.description || '';
        await new Promise(resolve => setTimeout(resolve, /test:traag/i.test(description) ? 8000 : 400));
        if (/test:fout/i.test(description)) return res.status(503).json({ error: 'Test: tijdelijke serverfout. Verwijder test:fout om opnieuw te proberen.' });
        if (url.pathname === '/api/proxy') return res.json({ analysis: /test:geen/i.test(description) ? noMeal : meal });
        if (url.pathname === '/api/whisper') return res.json({ text: '200 gram gekookte pasta met groentesaus' });
        return res.status(404).json({ error: 'Onbekende testfunctie.' });
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
    if (demo && path === '/index.html') content = Buffer.from(content.toString().replace('<main class="page-shell">', '<main class="page-shell"><p class="notice" role="note">LOKALE TESTVERSIE — vaste voorbeeldresultaten, geen echte fotoanalyse. Testwoorden in de beschrijving: test:geen, test:fout, test:traag.</p>'));
    res.setHeader('Content-Type', types[extname(full)]);
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) { if (!res.headersSent) res.statusCode = error.code === 'ENOENT' ? 404 : 500; res.end('Niet beschikbaar.'); }
}).listen(port, '127.0.0.1', () => console.log(`${demo ? 'DEMO (geen OpenAI-aanvragen)' : 'Lokale app'}: http://127.0.0.1:${port}`));
