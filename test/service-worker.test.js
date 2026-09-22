import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
function worker() {
  const events = {}; const deleted = []; const saved = []; let skipped = false;
  const fallback = new Response('offline app');
  vm.runInNewContext(source, {
    URL, Response, AbortController, setTimeout, clearTimeout,
    self: { registration: { scope: 'https://example.com/' }, location: { origin: 'https://example.com' }, clients: { claim: async () => {} }, skipWaiting: () => { skipped = true; }, addEventListener: (type, action) => { events[type] = action; } },
    caches: { keys: async () => ['carbo-app-v7', 'carbo-app-v25', 'other-app'], delete: async key => { deleted.push(key); }, match: async () => fallback, open: async () => ({ addAll: async () => {}, match: async () => fallback, put: async (...args) => saved.push(args) }) },
    fetch: async () => new Response('server error', { status: 503 }),
  });
  return { events, deleted, saved, skipped: () => skipped };
}
test('updates wachten op gebruiker en verwijderen alleen eigen oude caches', async () => {
  const w = worker(); let pending;
  w.events.install({ waitUntil: value => { pending = value; } }); await pending; assert.equal(w.skipped(), false);
  w.events.message({ data: { type: 'SKIP_WAITING' } }); assert.equal(w.skipped(), true);
  w.events.activate({ waitUntil: value => { pending = value; } }); await pending;
  assert.deepEqual(w.deleted, ['carbo-app-v7']);
});
test('serviceworker raakt analyse en audioverzoeken niet aan', () => {
  const w = worker();
  for (const request of [{ method: 'POST', url: 'https://example.com/api/proxy' }, { method: 'GET', url: 'https://example.com/api/whisper' }]) w.events.fetch({ request, respondWith: () => assert.fail('API request intercepted') });
});
test('serverfout overschrijft de werkende offline startpagina niet', async () => {
  const w = worker(); let pending;
  w.events.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://example.com/' }, respondWith: value => { pending = value; } });
  assert.equal(await (await pending).text(), 'offline app'); assert.equal(w.saved.length, 0);
});

