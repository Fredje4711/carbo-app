// Development only: use the existing Vercel backend without copying its API key.
const BACKEND = 'https://carbo-app.vercel.app';
const PATHS = new Set(['/api/proxy', '/api/whisper']);
export async function relayToVercel(req, res, path, request = fetch) {
  if (!PATHS.has(path) || req.method !== 'POST') {
    res.status(405).json({ error: 'Deze lokale route ondersteunt alleen fotoanalyse en spraak via POST.' });
    return;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 6_000_000) { res.status(413).json({ error: 'De foto of opname is te groot.' }); return; }
    chunks.push(chunk);
  }
  try {
    const response = await request(`${BACKEND}${path}`, {
      method: 'POST', signal: AbortSignal.timeout(52_000),
      headers: { 'Content-Type': req.headers['content-type'] || 'application/octet-stream' },
      body: Buffer.concat(chunks),
    });
    const data = await response.json().catch(() => ({ error: 'Vercel gaf geen leesbaar antwoord. Probeer opnieuw.' }));
    for (const name of ['Retry-After', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']) {
      const value = response.headers.get(name); if (value) res.setHeader(name, value);
    }
    res.status(response.status).json(data);
  } catch {
    res.status(502).json({ error: 'De verbinding met de analyseservice op Vercel is niet gelukt. Controleer uw internet en probeer opnieuw.' });
  }
}
