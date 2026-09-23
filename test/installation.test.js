import test from 'node:test';
import assert from 'node:assert/strict';
import { devicePlatform, scannerAllowed } from '../lib/installation.js';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const entrySource = readFileSync(new URL('../entry.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/, '')
  .replace(/await import\('\.\/script\.js\?v=\d+'\)/, 'await loadScanner()');
async function gateway({ device = 'android', standalone = false, hostname = 'carbo-app.vercel.app', search = '' } = {}) {
  const elements = new Map(); const events = {}; let loads = 0;
  const get = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, addEventListener(name, action) { this[name] = action; } });
    return elements.get(id);
  };
  vm.runInNewContext(entrySource, {
    document: { getElementById: get }, navigator: {}, location: { hostname, search },
    devicePlatform: () => device, scannerAllowed,
    matchMedia: () => ({ matches: standalone, addEventListener() {} }),
    window: { addEventListener: (name, action) => { events[name] = action; } },
    loadScanner: async () => { loads++; },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { get, events, loads: () => loads };
}

test('herkenning toont expliciete toestelmelding en uitsluitend de passende stappen', async () => {
  for (const [device, label] of [['desktop', 'computer'], ['android', 'Android-gsm'], ['ios', 'iPhone']]) {
    const page = await gateway({ device });
    assert.equal(page.get('detectedDevice').textContent, 'Geopend op een ' + label + '.');
    for (const platform of ['desktop', 'android', 'ios']) assert.equal(page.get(platform + 'Instructions').hidden, platform !== device);
    assert.equal(page.loads(), 0);
  }
});

test('installatiebevestiging in browser ontgrendelt de scanner nog niet', async () => {
  const page = await gateway();
  assert.equal(page.get('installationGate').hidden, false);
  assert.equal(page.get('androidInstructions').hidden, false);
  page.events.appinstalled();
  assert.equal(page.loads(), 0);
  assert.equal(page.get('application').hidden, true);
  assert.match(page.get('gatewayStatus').textContent, /pictogram/);
});

test('bevestigde installatie toont wachthulp en voorkomt herhaald starten', async () => {
  const page = await gateway(); let prompts = 0;
  page.events.beforeinstallprompt({ preventDefault() {}, prompt: async () => { prompts++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert.equal(page.get('androidDirectHelp').hidden, false);
  assert.equal(page.get('androidFallback').open, false);
  await page.get('gatewayInstallBtn').click();
  assert.match(page.get('gatewayStatus').textContent, /enkele tientallen seconden/);
  await page.get('gatewayInstallBtn').click();
  assert.equal(prompts, 1);
  page.events.appinstalled();
  assert.match(page.get('gatewayStatus').textContent, /Installatie voltooid/);
  assert.equal(page.get('androidFallback').hidden, true);
});

test('vroege voltooiingsmelding wordt niet overschreven door wachttekst', async () => {
  const page = await gateway();
  page.events.beforeinstallprompt({ preventDefault() {}, prompt: async () => page.events.appinstalled(), userChoice: Promise.resolve({ outcome: 'accepted' }) });
  await page.get('gatewayInstallBtn').click();
  assert.match(page.get('gatewayStatus').textContent, /Installatie voltooid/);
});

test('annuleren of fout toont de alternatieve installatiestappen', async () => {
  for (const fails of [false, true]) {
    const page = await gateway();
    page.events.beforeinstallprompt({ preventDefault() {}, prompt: async () => { if (fails) throw Error('failed'); }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    await page.get('gatewayInstallBtn').click();
    assert.equal(page.get('androidFallback').open, true);
    assert.match(page.get('gatewayStatus').textContent, /browsermenu/);
  }
});

test('standalone en laptoptest laden scanner zonder installatiepaneel', async () => {
  for (const options of [{ device: 'ios', standalone: true }, { device: 'desktop', hostname: '127.0.0.1', search: '?test=1' }]) {
    const page = await gateway(options);
    assert.equal(page.loads(), 1);
    assert.equal(page.get('application').hidden, false);
    assert.equal(page.get('installationGate').hidden, true);
  }
});

test('toestelherkenning gebruikt het systeem, niet de schermbreedte', () => {
  assert.equal(devicePlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), 'ios');
  assert.equal(devicePlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8)' }), 'android');
  assert.equal(devicePlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'desktop');
  assert.equal(devicePlatform({ platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');
  assert.equal(devicePlatform({ platform: 'MacIntel', maxTouchPoints: 0 }), 'desktop');
});

test('publieke browser en testparameters openen de scanner niet', () => {
  for (const device of ['ios', 'android', 'desktop']) {
    for (const search of ['', '?test=1', '?installed=true']) {
      assert.equal(scannerAllowed({ hostname: 'carbo-app.vercel.app', search, device }), false);
    }
  }
  assert.equal(scannerAllowed({ hostname: 'localhost.example.com', search: '?test=1', device: 'desktop' }), false);
});

test('alleen geïnstalleerd op gsm of expliciete lokale testtoegang', () => {
  for (const device of ['ios', 'android']) assert.equal(scannerAllowed({ hostname: 'carbo-app.vercel.app', standalone: true, device }), true);
  assert.equal(scannerAllowed({ hostname: 'carbo-app.vercel.app', standalone: true, device: 'desktop' }), false);
  assert.equal(scannerAllowed({ hostname: '127.0.0.1', search: '?test=1', device: 'desktop' }), true);
  assert.equal(scannerAllowed({ hostname: 'localhost', device: 'desktop' }), false);
});

