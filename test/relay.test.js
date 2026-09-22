import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { relayToVercel } from '../tools/vercel-relay.mjs';

function response() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
}
test('lokale app stuurt de werkelijk gekozen afbeelding door en retourneert Vercels resultaat', async () => {
  const input = JSON.stringify({ image: 'data:image/jpeg;base64,aGVsbG8=', description: 'frieten' });
  const req = Readable.from([Buffer.from(input)]); req.method = 'POST'; req.headers = { 'content-type': 'application/json', cookie: 'niet-doorsturen' };
  const res = response();
  await relayToVercel(req, res, '/api/proxy', async (url, options) => {
    assert.equal(url, 'https://carbo-app.vercel.app/api/proxy');
    assert.equal(options.body.toString(), input);
    assert.equal('cookie' in options.headers, false);
    return new Response(JSON.stringify({ analysis: { summary: 'serverresultaat voor frieten' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  assert.equal(res.code, 200); assert.equal(res.data.analysis.summary, 'serverresultaat voor frieten');
});
test('lokale server geeft bij verbindingsfout geen verzonnen maaltijd terug', async () => {
  const req = Readable.from([Buffer.from('{}')]); req.method = 'POST'; req.headers = {};
  const res = response(); await relayToVercel(req, res, '/api/proxy', async () => { throw new Error('offline'); });
  assert.equal(res.code, 502); assert.equal(res.data.analysis, undefined);
});
test('lokale relay staat geen willekeurige externe route toe', async () => {
  const res = response(); await relayToVercel({ method: 'POST' }, res, '/other', () => assert.fail('Unexpected network call'));
  assert.equal(res.code, 405);
});
