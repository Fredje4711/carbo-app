import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnalysis } from '../lib/analysis.js';
import { validDraft, addHistory, createLocalData } from '../lib/local-data.js';
import { parseCredits, creditValue } from '../lib/credits.js';
import { rateLimit, allowRequest } from '../lib/rate-limit.js';
import { setRateLimitHeaders } from '../lib/server.js';
import { meal, noMeal } from './fixtures.js';

test('totalen worden uit onderdelen berekend; zekerheid wordt niet overdreven', () => {
  const result = normalizeAnalysis({ ...meal, total: { ...meal.total, carbs_best_g: 70 } });
  assert.equal(result.total.carbs_best_g, 64);
  assert.equal(result.total.confidence, 'laag');
  assert.equal(normalizeAnalysis(noMeal).meal_detected, false);
});
test('ongeldige modeluitvoer wordt niet als nulgramresultaat getoond', () => {
  for (const value of [null, {}, { ...meal, items: [] }, { ...meal, summary: '' }, { ...meal, total: { ...meal.total, carbs_best_g: NaN } }, { ...meal, items: [{ ...meal.items[0], carbs_min_g: 100 }] }, { ...noMeal, items: meal.items }]) assert.throws(() => normalizeAnalysis(value));
});
test('bestaande scantellers migreren en onbeperkt blijft onbeperkt', () => {
  assert.equal(parseCredits(null), 50); assert.equal(parseCredits('0'), 0); assert.equal(parseCredits('37'), 37);
  assert.equal(parseCredits('onzin'), 50); assert.equal(parseCredits('-1'), 50);
  assert.equal(parseCredits(creditValue(Infinity)), Infinity);
});
test('herstelsessies verlopen na 24 uur en corrupte sessies worden geweigerd', () => {
  const now = Date.now(); const draft = { version: 1, savedAt: now, image: null, description: 'pasta' };
  assert.equal(validDraft(draft, now), true);
  assert.equal(validDraft(draft, now + 86_400_000), false);
  assert.equal(validDraft(draft, now - 1), false);
  assert.equal(validDraft({ ...draft, image: 'https://example.com/private.jpg' }), false);
  assert.equal(validDraft({ ...draft, description: 'x'.repeat(801) }), false);
});
test('geschiedenis blijft beperkt tot tien unieke resultaten', () => {
  let history = [];
  for (let i = 0; i < 15; i++) history = addHistory(history, { id: i });
  assert.equal(history.length, 10); assert.equal(history[0].id, 14); assert.equal(history[9].id, 5);
  assert.equal(addHistory(history, { id: 14 }).length, 10);
});
test('geblokkeerde lokale opslag levert een afhandelbare fout', async () => { await assert.rejects(createLocalData(null).get('draft'), /niet beschikbaar/); });
test('lokale serverlimiet blokkeert en geeft wachttijd terug', async () => {
  const options = { limit: 1, windowMs: 60000 };
  assert.equal((await rateLimit('test', 'local-limit', options, {})).allowed, true);
  const limited = await rateLimit('test', 'local-limit', options, {});
  assert.equal(limited.allowed, false);
  const headers = {}; setRateLimitHeaders({ setHeader: (key, value) => { headers[key] = value; } }, limited);
  assert.ok(Number(headers['Retry-After']) > 0);
});
test('gedeelde serverlimiet gebruikt atomaire Redis-call zonder onbewerkt IP', async () => {
  const env = { UPSTASH_REDIS_REST_URL: 'https://test.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'fake-token' };
  const result = await rateLimit('analysis', '192.0.2.33', { limit: 10, windowMs: 60000 }, env, async (_url, options) => {
    const command = JSON.parse(options.body);
    assert.equal(command[0], 'EVAL'); assert.equal(command[2], '2'); assert.equal(options.body.includes('192.0.2.33'), false);
    return { ok: true, json: async () => ({ result: [0, 0, 60000] }) };
  });
  assert.equal(result.allowed, false);
  await assert.rejects(rateLimit('analysis', 'ip', { limit: 10, windowMs: 60000 }, env, async () => ({ ok: false })));
  await assert.rejects(rateLimit('analysis', 'ip', { limit: 10, windowMs: 60000 }, { UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL }));
});
