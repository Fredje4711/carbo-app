import { devicePlatform, scannerAllowed } from './lib/installation.js?v=26';

const $ = id => document.getElementById(id);
const device = devicePlatform(navigator);
const isIpad = /iPad/i.test(navigator.userAgent || '') || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
$('detectedDevice').textContent = device === 'android' ? 'Geopend op een Android-gsm.' : device === 'ios' ? (isIpad ? 'Geopend op een iPad.' : 'Geopend op een iPhone.') : 'Geopend op een computer.';
const displayMode = matchMedia('(display-mode: standalone)');
let promptEvent;
let launched = false;
let selected = device;
let installing = false;
let installed = false;

function showInstructions(platform) {
  selected = platform;
  for (const name of ['desktop', 'ios', 'android']) $(`${name}Instructions`).hidden = name !== platform;
  const direct = platform === 'android' && device === 'android' && !!promptEvent && !installing && !installed;
  $('gatewayInstallBtn').hidden = !direct;
  $('androidDirectHelp').hidden = !direct;
  $('androidFallback').hidden = installed;
  $('androidFallback').open = !direct && !installing && !installed;
}

async function openScanner() {
  if (launched) return;
  if (!scannerAllowed({ hostname: location.hostname, search: location.search, device, standalone: displayMode.matches || navigator.standalone === true })) {
    $('installationGate').hidden = false; return;
  }
  launched = true;
  try {
    await import('./script.js?v=26');
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
  installed = true; installing = false;
  promptEvent = null; showInstructions(selected);
  $('gatewayStatus').textContent = 'Installatie voltooid. U vindt KH Scanner op uw beginscherm of in het overzicht van al uw apps. Tik op het pictogram om de app te openen.';
});
$('gatewayInstallBtn').addEventListener('click', async () => {
  if (!promptEvent || installing || installed) return;
  installing = true;
  const prompt = promptEvent; promptEvent = null; showInstructions(selected);
  $('gatewayStatus').textContent = 'Bevestig de installatie in het venster van uw browser.';
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (installed) return;
    installing = choice.outcome === 'accepted';
    $('gatewayStatus').textContent = installing ? 'Uw toestel verwerkt de installatie. Dit kan enkele tientallen seconden duren, soms langer. Wacht rustig op de bevestiging; u hoeft niet opnieuw te klikken. Open daarna KH Scanner via het pictogram tussen uw apps.' : 'De installatie is niet bevestigd. U kunt de stappen via het browsermenu hieronder volgen.';
    showInstructions(selected);
  } catch {
    if (installed) return;
    installing = false;
    $('gatewayStatus').textContent = 'Rechtstreeks installeren lukte niet. Volg de stappen via het browsermenu hieronder.';
    showInstructions(selected);
  }
});
displayMode.addEventListener?.('change', openScanner);
showInstructions(device);
openScanner();
// Also register on the gateway so Android can offer installation before app use.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
