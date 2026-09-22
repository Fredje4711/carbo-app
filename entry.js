import { devicePlatform, scannerAllowed } from './lib/installation.js?v=15';

const $ = id => document.getElementById(id);
const device = devicePlatform(navigator);
const isIpad = /iPad/i.test(navigator.userAgent || '') || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
$('detectedDevice').textContent = device === 'android' ? 'Geopend op een Android-gsm.' : device === 'ios' ? (isIpad ? 'Geopend op een iPad.' : 'Geopend op een iPhone.') : 'Geopend op een computer.';
const displayMode = matchMedia('(display-mode: standalone)');
let promptEvent;
let launched = false;
let selected = device;

function showInstructions(platform) {
  selected = platform;
  for (const name of ['desktop', 'ios', 'android']) $(`${name}Instructions`).hidden = name !== platform;
  $('gatewayInstallBtn').hidden = platform !== 'android' || device !== 'android' || !promptEvent;
}

async function openScanner() {
  if (launched) return;
  if (!scannerAllowed({ hostname: location.hostname, search: location.search, device, standalone: displayMode.matches || navigator.standalone === true })) {
    $('installationGate').hidden = false; return;
  }
  launched = true;
  try {
    await import('./script.js?v=15');
    $('installationGate').hidden = true;
    $('application').hidden = false;
  } catch {
    launched = false;
    $('installationGate').hidden = false;
    $('gatewayStatus').textContent = 'De app kon niet laden. Controleer uw verbinding en vernieuw deze pagina.';
  }
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); promptEvent = event; showInstructions(selected);
});
window.addEventListener('appinstalled', () => {
  promptEvent = null; showInstructions(selected);
  $('gatewayStatus').textContent = 'Installatie voltooid. Sluit deze pagina en open KH Scanner via het pictogram op uw beginscherm.';
});
$('gatewayInstallBtn').addEventListener('click', async () => {
  if (!promptEvent) return;
  const prompt = promptEvent; promptEvent = null; showInstructions(selected);
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    $('gatewayStatus').textContent = choice.outcome === 'accepted' ? 'Open na installatie KH Scanner via het pictogram op uw beginscherm.' : 'Installatie geannuleerd. U kunt de stappen hieronder volgen om later te installeren.';
  } catch { $('gatewayStatus').textContent = 'Volg de stappen hieronder om via het browsermenu te installeren.'; }
});
$('chooseIos').addEventListener('click', () => showInstructions('ios'));
$('chooseAndroid').addEventListener('click', () => showInstructions('android'));
displayMode.addEventListener?.('change', openScanner);
showInstructions(device);
openScanner();
// Also register on the gateway so Android can offer installation before app use.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
