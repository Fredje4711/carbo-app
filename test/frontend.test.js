import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { normalizeAnalysis, formatGrams } from '../lib/analysis.js';
import { validDraft, addHistory } from '../lib/local-data.js';
import { CREDIT_KEY, FEEDBACK_CODE, parseCredits, creditValue } from '../lib/credits.js';
import { meal, noMeal } from './fixtures.js';

const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('refreshCredits(); syncUI(); setupInstallation(); initializeStorage();', '');
class Element {
  constructor() { this.value = ''; this.hidden = false; this.disabled = false; this.dataset = {}; this.children = []; this.events = {}; this.classList = { toggle() {} }; }
  addEventListener(type, action) { (this.events[type] ??= []).push(action); }
  async emit(type, event = {}) { await Promise.all((this.events[type] || []).map(action => action({ preventDefault() {}, ...event }))); }
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  focus() {} scrollIntoView() {} removeAttribute(name) { delete this[name]; }
  showModal() { this.open = true; } close() { this.open = false; }
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; }
function harness(options = {}) {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const stored = new Map(); const local = new Map();
  const document = new Element(); document.getElementById = get; document.body = new Element();
  document.createElement = tag => tag === 'canvas' ? { getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,dGVzdA==' } : new Element();
  const window = new Element();
  const stream = { stopped: false, getTracks() { return [{ stop: () => { stream.stopped = true; } }]; } };
  class Recorder extends Element {
    static isTypeSupported() { return true; }
    constructor() { super(); this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.emit('dataavailable', { data: new Blob(['audio']) }); this.emit('stop'); }
  }
  const context = vm.createContext({
    console, document, window, navigator: { onLine: true, mediaDevices: { getUserMedia: async () => stream } },
    location: { hostname: 'localhost' }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    createLocalData: () => ({ get: async key => local.get(key), put: async (key, value) => local.set(key, value), delete: async key => local.delete(key), clear: async () => local.clear() }),
    normalizeAnalysis, formatGrams, validDraft, addHistory, CREDIT_KEY, FEEDBACK_CODE, parseCredits, creditValue,
    setTimeout, clearTimeout, setInterval, clearInterval, AbortController, Blob, FormData, URL, crypto: webcrypto, MediaRecorder: Recorder,
    fetch: async () => ({ ok: true, json: async () => ({ analysis: structuredClone(meal) }) }),
    createImageBitmap: async () => ({ width: 100, height: 100, close() {} }),
    ...options,
  });
  vm.runInContext(source + '\nthis.app = { state, analyze, resetApp, selectImage, toggleRecording, cancelWork, finishRecording, saveDraft, initializeStorage, clearSavedData, syncUI, refreshCredits, requestJson, setupInstallation, setWorker(worker) { waitingWorker = worker; } };', context);
  context.app.state.mode = 'idle'; context.app.refreshCredits(); context.app.syncUI();
  return { app: context.app, context, get, stored, local, stream };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('wissen tijdens opname stuurt geen audio op en voegt geen tekst toe', async () => {
  let requests = 0;
  const { app, stream, get } = harness({ fetch: async () => { requests++; throw new Error('Unexpected request'); } });
  await app.toggleRecording(); assert.equal(app.state.mode, 'recording');
  app.resetApp(); await flush();
  assert.equal(requests, 0); assert.equal(stream.stopped, true); assert.equal(get('description').value, '');
});
test('late microfoontoestemming na wissen sluit de microfoon direct', async () => {
  const permission = deferred();
  const { app, context, stream } = harness();
  context.navigator.mediaDevices.getUserMedia = () => permission.promise;
  const pending = app.toggleRecording(); app.resetApp(); permission.resolve(stream); await pending;
  assert.equal(stream.stopped, true); assert.equal(app.state.mode, 'idle');
});
test('analyse is geblokkeerd tijdens opnemen en tekstomzetting', async () => {
  const { app, get } = harness(); app.state.image = 'data:image/jpeg;base64,dGVzdA==';
  await app.toggleRecording(); assert.equal(get('analyzeButton').disabled, true);
  await app.analyze(); assert.equal(app.state.mode, 'recording'); app.cancelWork();
  app.state.mode = 'transcribing'; app.syncUI(); assert.equal(get('analyzeButton').disabled, true);
});
test('wissen tijdens tekstomzetting negeert het late antwoord', async () => {
  const response = deferred(); const { app, get } = harness({ fetch: () => response.promise });
  await app.toggleRecording(); await app.toggleRecording();
  assert.equal(app.state.mode, 'transcribing'); app.resetApp();
  response.resolve({ ok: true, json: async () => ({ text: 'oude beschrijving' }) }); await flush();
  assert.equal(get('description').value, ''); assert.equal(app.state.mode, 'idle');
});
test('geannuleerde analyse bewaart invoer, negeert laat resultaat en verbruikt geen scan', async () => {
  const response = deferred(); const { app, get } = harness({ fetch: () => response.promise });
  app.state.image = 'data:image/jpeg;base64,dGVzdA=='; get('description').value = 'pasta';
  const pending = app.analyze(); await flush(); app.cancelWork();
  response.resolve({ ok: true, json: async () => ({ analysis: meal }) }); await pending;
  assert.equal(app.state.credits, 50); assert.equal(app.state.analysis, null); assert.equal(get('description').value, 'pasta'); assert.ok(app.state.image);
});
test('niet-herkende maaltijd verbergt totalen en kost geen scan', async () => {
  const { app, get } = harness({ fetch: async () => ({ ok: true, json: async () => ({ analysis: noMeal }) }) });
  app.state.image = 'data:image/jpeg;base64,dGVzdA=='; await app.analyze();
  assert.equal(get('totalPanel').hidden, true); assert.equal(get('result-title').textContent, 'Geen bruikbare schatting'); assert.equal(app.state.credits, 50);
});
test('foutieve serveruitvoer laat invoer staan en biedt opnieuw proberen', async () => {
  const { app, get } = harness({ fetch: async () => ({ ok: true, json: async () => ({ analysis: { meal_detected: true } }) }) });
  app.state.image = 'data:image/jpeg;base64,dGVzdA=='; await app.analyze();
  assert.equal(app.state.retry, true); assert.equal(app.state.credits, 50); assert.ok(app.state.image); assert.equal(get('resultSection').hidden, true);
});
test('laatste fotokeuze wint ook wanneer de eerste foto later klaar is', async () => {
  const first = deferred(); let call = 0;
  const { app, context } = harness({ createImageBitmap: async () => ++call === 1 ? first.promise : { width: 100, height: 100, close() {} } });
  let pixels = 0;
  context.document.createElement = tag => tag === 'canvas' ? { getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => `data:image/jpeg;base64,${++pixels}` } : new Element();
  const event = () => ({ target: { files: [{ size: 100, type: 'image/jpeg', name: 'foto.jpg' }], value: 'foto.jpg' } });
  const pending = app.selectImage(event()); await app.selectImage(event()); const latest = app.state.image;
  first.resolve({ width: 100, height: 100, close() {} }); await pending;
  assert.equal(app.state.image, latest); assert.equal(app.state.mode, 'idle');
});
test('wissen tijdens fotoverkleining herstelt de oude foto niet', async () => {
  const decoded = deferred(); const { app } = harness({ createImageBitmap: () => decoded.promise });
  const pending = app.selectImage({ target: { files: [{ size: 100, type: 'image/jpeg', name: 'foto.jpg' }] } });
  app.resetApp(); decoded.resolve({ width: 100, height: 100, close() {} }); await pending;
  assert.equal(app.state.image, null);
});
test('feedbackcode geeft blijvend onbeperkt en succesvolle scans verminderen dat niet', async () => {
  const { app, get, stored } = harness(); get('refillCode').value = FEEDBACK_CODE;
  await get('refillForm').emit('submit'); assert.equal(stored.get(CREDIT_KEY), 'unlimited');
  app.state.image = 'data:image/jpeg;base64,dGVzdA=='; await app.analyze();
  assert.equal(app.state.credits, Infinity); assert.equal(get('creditCount').textContent, 'Onbeperkt');
});
test('alleen met toestemming worden sessie en fotoloze geschiedenis opgeslagen', async () => {
  const { app, local, stored } = harness(); app.state.image = 'data:image/jpeg;base64,dGVzdA==';
  await app.analyze(); await flush(); assert.equal(local.size, 0);
  app.state.remember = true; stored.set('carbo_remember_meals', '1'); await app.analyze(); await flush();
  assert.equal(local.get('history').length, 1); assert.equal('image' in local.get('history')[0], false); assert.equal(local.get('draft').image, app.state.image);
  await app.clearSavedData(); assert.equal(local.size, 0); assert.equal(app.state.history.length, 0); assert.equal(stored.get(CREDIT_KEY), '48');
});

test('een offline gsm start geen analyse en kan het resultaat nog wissen', async () => {
  let requests = 0; const { app, context, get } = harness({ fetch: async () => { requests++; } });
  app.state.image = 'data:image/jpeg;base64,dGVzdA=='; context.navigator.onLine = false;
  await app.analyze(); assert.equal(requests, 0); assert.equal(get('analyzeButton').disabled, true);
  app.state.analysis = noMeal; app.syncUI(); assert.equal(get('analyzeButton').disabled, false); assert.equal(get('analyzeButton').textContent, 'Nieuwe maaltijd');
});
test('een timeout breekt ook de browseraanvraag af', async () => {
  let timeoutAction;
  const { app } = harness({
    setTimeout: action => { timeoutAction = action; return 1; }, clearTimeout() {},
    fetch: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
  });
  const controller = new AbortController(); const pending = app.requestJson('/api/whisper', {}, controller);
  timeoutAction(); await assert.rejects(pending, /duurde te lang/); assert.equal(controller.signal.aborted, true);
});
test('onbeperkt blijft deze sessie werken wanneer schrijven naar opslag faalt', async () => {
  const { app, get, context, stored } = harness(); stored.set(CREDIT_KEY, '5');
  context.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  get('refillCode').value = FEEDBACK_CODE; await get('refillForm').emit('submit');
  app.state.image = 'data:image/jpeg;base64,dGVzdA=='; await app.analyze();
  assert.equal(app.state.credits, Infinity); assert.equal(get('creditCount').textContent, 'Onbeperkt');
});
test('na een resultaat start de vaste hoofdknop een nieuwe maaltijd zonder herhaalscan', async () => {
  const { app, get } = harness(); app.state.image = 'data:image/jpeg;base64,dGVzdA=='; await app.analyze();
  assert.equal(get('analyzeButton').textContent, 'Nieuwe maaltijd');
  await get('analyzeButton').emit('click'); assert.equal(app.state.image, null); assert.equal(app.state.credits, 49);
});
test('een vervallen herstelsessie wordt bij openen ook uit opslag verwijderd', async () => {
  const { app, stored, local } = harness(); stored.set('carbo_remember_meals', '1');
  local.set('draft', { version: 1, savedAt: Date.now() - 86_400_001, image: null, description: 'oud' });
  await app.initializeStorage(); assert.equal(app.state.pendingDraft, null); assert.equal(local.has('draft'), false);
});

test('een update wordt uitgesteld wanneer de huidige maaltijd niet kan worden opgeslagen', async () => {
  let posted = false;
  const { app, get } = harness({ createLocalData: () => ({ put: async () => { throw new Error('Full'); } }) });
  app.setupInstallation(); app.setWorker({ postMessage: () => { posted = true; } });
  app.state.remember = true; app.state.image = 'data:image/jpeg;base64,dGVzdA==';
  await get('updateBtn').emit('click'); assert.equal(posted, false); assert.match(get('statusMessage').textContent, /uitgesteld/);
});

test('oude lokale demoresultaten worden niet als echte scans hersteld', async () => {
  const { app, stored, local } = harness(); stored.set('carbo_remember_meals', '1');
  local.set('history', [{ id: 'oude-demo', date: Date.now(), analysis: meal }]);
  local.set('draft', { version: 1, savedAt: Date.now(), image: 'data:image/jpeg;base64,dGVzdA==', description: '', analysis: meal });
  await app.initializeStorage();
  assert.equal(app.state.history.length, 0); assert.equal(app.state.pendingDraft.analysis, null);
  assert.ok(app.state.pendingDraft.image);
});
