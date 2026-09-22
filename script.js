import { normalizeAnalysis, formatGrams } from './lib/analysis.js?v=22';
import { createLocalData, validDraft, addHistory } from './lib/local-data.js?v=22';
import { CREDIT_KEY, FEEDBACK_CODE, parseCredits, creditValue } from './lib/credits.js?v=22';

const API_BASE = location.hostname.endsWith('github.io') ? 'https://carbo-app.vercel.app' : '';
const REQUEST_TIMEOUT = 55_000;
const REMEMBER_KEY = 'carbo_remember_meals';
const LOCAL_PREVIEW = ['localhost', '127.0.0.1'].includes(location.hostname);
const $ = id => document.getElementById(id);
const localData = createLocalData();
const state = { mode: 'starting', image: null, analysis: null, operation: 0, controller: null, recording: null, remember: false, history: [], pendingDraft: null, credits: 50, creditStorageBlocked: false, retry: false, historical: false, resultDirty: false, savedMealId: null };
let saveTimer;
let storageQueue = Promise.resolve();
let storageWarningShown = false;
let waitingWorker;
let updateRequested = false;
let confirmAction;

function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
function refreshCredits() {
  const stored = storageGet(CREDIT_KEY);
  if (stored !== null && !state.creditStorageBlocked) state.credits = parseCredits(stored);
  $('creditCount').textContent = state.credits === Infinity ? 'Onbeperkt' : String(state.credits);
}
function useCredit() {
  refreshCredits();
  if (state.credits !== Infinity) state.credits = Math.max(0, state.credits - 1);
  state.creditStorageBlocked = !storageSet(CREDIT_KEY, creditValue(state.credits));
  refreshCredits();
}
function status(message, type = 'info') {
  $('statusMessage').textContent = message;
  $('statusMessage').dataset.type = type;
  $('statusMessage').hidden = !message;
}
function online() { return navigator.onLine !== false; }
function speechSupported() { return Boolean(navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'); }
function syncUI() {
  const busy = state.mode !== 'idle';
  const speaking = ['permission', 'recording', 'transcribing'].includes(state.mode);
  const completed = Boolean(state.analysis) || state.historical || state.resultDirty;
  $('analyzeButton').disabled = busy || !state.image || !online() || state.credits <= 0 || Boolean(state.pendingDraft);
  $('analyzeButton').textContent = state.mode === 'analyzing' ? 'Analyseren…' : completed ? 'Opnieuw analyseren' : state.retry ? 'Opnieuw proberen' : 'Analyseer maaltijd';
  $('analyzeButton').classList.toggle('loading', state.mode === 'analyzing');
  $('cancelAnalysisBtn').hidden = state.mode !== 'analyzing';
  $('resetBtn').hidden = state.mode === 'analyzing';
  $('resetBtn').disabled = ['starting', 'saving'].includes(state.mode);
  // Selecting another photo during preparation is allowed; operation tokens discard the old decode.
  $('cameraInput').disabled = busy && state.mode !== 'preparing' || Boolean(state.pendingDraft);
  $('fileInput').disabled = $('cameraInput').disabled;
  $('description').disabled = busy || Boolean(state.pendingDraft);
  $('recordBtn').disabled = !speechSupported() || !online() || (busy && state.mode !== 'recording') || Boolean(state.pendingDraft);
  $('recordBtn').textContent = state.mode === 'recording' ? 'Stop opname' : state.mode === 'permission' ? 'Microfoon openen…' : state.mode === 'transcribing' ? 'Tekst verwerken…' : '🎤 Spreek in';
  $('recordBtn').classList.toggle('recording', state.mode === 'recording');
  $('cancelRecordBtn').hidden = !speaking;
  $('recordTimer').hidden = state.mode !== 'recording';
  $('speechHelp').textContent = speechSupported() ? 'Tik om op te nemen. Tik opnieuw om te stoppen.' : 'Deze browser ondersteunt geen spraakopname. U kunt de beschrijving typen.';
  $('speechHelp').hidden = speechSupported();
  $('offlineNotice').hidden = online();
  $('refillBtn').disabled = busy;
  $('restoreBtn').disabled = state.mode === 'starting';
  $('discardDraftBtn').disabled = state.mode === 'starting';
  $('updateBtn').disabled = busy || Boolean(state.pendingDraft);
  $('correctPortionBtn').disabled = busy || !state.image || state.historical;
  $('newMealBtn').disabled = ['starting', 'saving'].includes(state.mode);
  $('mealsBtn').disabled = busy || Boolean(state.pendingDraft);
  $('saveMealBtn').disabled = busy || !state.analysis?.meal_detected || !state.image || state.resultDirty || Boolean(state.savedMealId);
  $('saveMealBtn').textContent = state.mode === 'saving' ? 'Bewaren…' : state.savedMealId ? 'Maaltijd bewaard' : 'Bewaar maaltijd';
  $('clearHistoryBtn').disabled = busy || !state.history.length;
  $('clearDataBtn').disabled = busy;
  $('rememberToggle').disabled = busy;
  $('charCount').textContent = `${$('description').value.length}/800`;
}
function setMode(mode) { state.mode = mode; syncUI(); }
function focusAndScroll(id) {
  const node = $(id);
  node.focus({ preventScroll: true });
  node.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
function markResultDirty() {
  state.savedMealId = null; $('saveMealStatus').hidden = true;
  if (!state.analysis && !state.resultDirty) return;
  state.analysis = null; state.resultDirty = true;
  $('resultContext').textContent = 'Vorige schatting. Uw informatie is gewijzigd; analyseer opnieuw voor een bijgewerkt resultaat.';
  $('resultContext').hidden = false;
}
function clearResult() {
  state.savedMealId = null; $('saveMealStatus').hidden = true;
  state.resultDirty = false;
  state.analysis = null;
  state.historical = false;
  $('resultSection').hidden = true;
}
function showPreview() {
  $('previewWrap').hidden = !state.image;
  if (state.image) $('preview').src = state.image;
  else $('preview').removeAttribute('src');
}
function persist(task) {
  storageQueue = storageQueue.then(async () => { await task(); return true; }).catch(() => {
    if (!storageWarningShown) {
      storageWarningShown = true;
      status('Opslaan op dit toestel is niet gelukt. De app werkt, maar deze sessie kan na sluiten verloren gaan.', 'error');
    }
    return false;
  });
  return storageQueue;
}
function saveDraft() {
  clearTimeout(saveTimer);
  if (!state.remember || state.pendingDraft) return storageQueue;
  const draft = { version: 1, source: 'live-v1', savedAt: Date.now(), image: state.image, description: $('description').value, analysis: state.analysis };
  return persist(() => draft.image || draft.description ? localData.put('draft', draft) : localData.delete('draft'));
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 300); }

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* Safari can support an image through <img> even when bitmap decoding fails. */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    const heic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    throw new Error(heic ? 'Deze browser kan deze HEIC-foto niet omzetten. Kies op uw gsm een JPEG-versie of maak een nieuwe foto met “Maak foto”.' : 'Deze foto kan niet worden gelezen. Kies een JPEG-, PNG- of WebP-foto.');
  }
}
async function prepareImage(file) {
  if (!file.size || file.size > 40 * 1024 * 1024) throw new Error('Kies een foto van maximaal 40 MB.');
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|hei[cf])$/i.test(file.name)) throw new Error('Kies een afbeeldingsbestand.');
  if (/svg/i.test(file.type) || /\.svg$/i.test(file.name)) throw new Error('Kies een foto, geen SVG-tekening.');
  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height || decoded.width * decoded.height > 100_000_000) throw new Error('De resolutie van deze foto is te groot. Kies een kleinere versie.');
    const scale = Math.min(1280 / decoded.width, 1280 / decoded.height, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('De foto kan op dit toestel niet worden verkleind.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', .84);
    if (data.length > 3_700_000 || !data.startsWith('data:image/jpeg;base64,')) throw new Error('De foto blijft te groot. Kies een kleinere foto.');
    return data;
  } finally { decoded.close(); }
}
async function selectImage(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !['idle', 'preparing'].includes(state.mode)) return;
  const operation = ++state.operation;
  state.retry = false; clearResult();
  setMode('preparing'); status('Foto wordt verkleind…');
  try {
    const image = await prepareImage(file);
    if (operation !== state.operation) return;
    state.image = image; showPreview();
    status('Foto klaar. Voeg eventueel informatie toe en analyseer uw maaltijd.', 'success');
    saveDraft();
  } catch (error) {
    if (operation !== state.operation) return;
    status(`${error.message}${state.image ? ' Uw vorige foto blijft geselecteerd.' : ''}`, 'error');
  } finally { if (operation === state.operation) setMode('idle'); }
}
async function requestJson(path, options, controller) {
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'De service is tijdelijk niet beschikbaar. Probeer opnieuw.');
      error.retryAfter = response.headers.get('Retry-After');
      const seconds = Number(error.retryAfter);
      if (response.status === 429 && Number.isFinite(seconds) && seconds > 0) error.message += ` Probeer over ongeveer ${Math.ceil(seconds / 60)} minuten opnieuw.`;
      throw error;
    }
    return data;
  } catch (error) {
    if (timedOut) throw new Error('Dit duurde te lang. Uw foto en tekst blijven staan. Probeer opnieuw.');
    if (error.name === 'AbortError') throw error;
    if (!online() || error instanceof TypeError) throw new Error('De verbinding werd onderbroken. Controleer uw internet en probeer opnieuw.');
    throw error;
  } finally { clearTimeout(timeout); }
}
async function analyze() {
  refreshCredits();
  if (state.mode !== 'idle' || !state.image || state.pendingDraft) return;
  if (!online()) { status('Voor de analyse is internet nodig. Uw foto en tekst blijven staan.', 'error'); syncUI(); return; }
  if (state.credits <= 0) { status('Uw gratis scans zijn opgebruikt. Stuur feedback en ontvang een code voor onbeperkt gratis scans.', 'error'); syncUI(); return; }
  const operation = ++state.operation;
  const controller = new AbortController(); state.controller = controller;
  clearResult(); state.retry = false;
  setMode('analyzing'); status('Uw maaltijd wordt geanalyseerd. Dit kan tot ongeveer een minuut duren.');
  await saveDraft();
  if (operation !== state.operation) return;
  try {
    const data = await requestJson('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: state.image, description: $('description').value.trim() }) }, controller);
    if (operation !== state.operation) return;
    state.analysis = normalizeAnalysis(data.analysis);
    renderAnalysis(state.analysis);
    if (state.analysis.meal_detected) {
      useCredit();

      status('Analyse voltooid.', 'success');
    } else status('Geen duidelijke maaltijd herkend. Probeer een andere foto. Er is geen scan afgetrokken.');
    saveDraft();
  } catch (error) {
    if (operation !== state.operation) return;
    state.retry = true;
    status(error.name === 'AbortError' ? 'Analyse geannuleerd. Uw foto en tekst blijven staan.' : error.message, 'error');
  } finally {
    if (operation === state.operation) { state.controller = null; setMode('idle'); }
  }
}
function addText(parent, tag, text, className = '') {
  const node = document.createElement(tag); node.textContent = text; node.className = className; parent.appendChild(node); return node;
}
function certainty(level) { return ({ hoog: 'Hoge zekerheid', middel: 'Redelijke zekerheid', laag: 'Lage zekerheid' })[level]; }
function renderAnalysis(analysis, context = '') {
  if ($('settingsDialog').open) $('settingsDialog').close();
  $('result-title').textContent = analysis.meal_detected ? 'Uw geschatte koolhydraten' : 'Geen bruikbare schatting';
  $('totalPanel').hidden = !analysis.meal_detected;
  $('noMealMessage').hidden = analysis.meal_detected;
  $('totalConfidence').hidden = !analysis.meal_detected;
  $('totalBest').textContent = formatGrams(analysis.total.carbs_best_g);
  $('totalRange').textContent = `${formatGrams(analysis.total.carbs_min_g)}–${formatGrams(analysis.total.carbs_max_g)} g`;
  $('totalConfidence').textContent = certainty(analysis.total.confidence);
  $('totalConfidence').dataset.level = analysis.total.confidence;
  $('summaryText').textContent = analysis.meal_detected ? analysis.summary : 'Er werd geen duidelijke maaltijd herkend. Maak een andere foto; dit betekent niet dat de maaltijd 0 g koolhydraten bevat.';
  $('resultContext').textContent = context; $('resultContext').hidden = !context;
  $('itemsList').replaceChildren();
  $('explanationList').replaceChildren();
  $('explanationDetails').open = false;
  for (const item of analysis.items) {
    const card = addText($('itemsList'), 'article', '', 'food-item');
    const heading = addText(card, 'div', '', 'food-heading');
    addText(heading, 'h3', item.name); addText(heading, 'strong', `${formatGrams(item.carbs_best_g)} g`, 'food-carbs');
    addText(card, 'p', item.portion);
    addText($('explanationList'), 'p', `${item.name}: ${formatGrams(item.carbs_min_g)}–${formatGrams(item.carbs_max_g)} g. ${item.reasoning}`, 'reasoning');
  }
  $('assumptionsList').replaceChildren();
  analysis.assumptions.forEach(text => addText($('assumptionsList'), 'li', text));
  $('assumptionsSection').hidden = !analysis.assumptions.length;
  $('assumptionsSection').open = false;
  $('resultSection').hidden = false;
  syncUI(); focusAndScroll('result-title');
}
async function saveMeal() {
  if (state.mode !== 'idle' || !state.image || !state.analysis?.meal_detected || state.resultDirty || state.savedMealId) return;
  const entry = { id: crypto.randomUUID(), source: 'live-v1', date: Date.now(), image: state.image, description: $('description').value, analysis: state.analysis };
  const history = addHistory(state.history, entry);
  setMode('saving');
  const saved = await persist(() => localData.put('history', history));
  if (saved) { state.history = history; state.savedMealId = entry.id; }
  $('saveMealStatus').textContent = saved ? 'Foto en resultaat bewaard bij Maaltijden.' : 'Bewaren is niet gelukt. Probeer opnieuw of maak ruimte vrij op uw toestel.';
  $('saveMealStatus').hidden = false;
  setMode('idle'); renderHistory();
}
function renderHistory() {
  $('historyCount').textContent = '(' + state.history.length + ')';
  $('historyList').replaceChildren();
  if (!state.history.length) addText($('historyList'), 'p', 'Nog geen bewaarde maaltijden. Kies Bewaar maaltijd bij een resultaat.', 'field-help');
  for (const entry of state.history) {
    const date = new Date(entry.date).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' });
    const button = addText($('historyList'), 'button', '', 'history-entry');
    button.type = 'button';
    if (entry.image) { const photo = addText(button, 'img', '', 'history-photo'); photo.src = entry.image; photo.alt = 'Maaltijdfoto'; photo.loading = 'lazy'; }
    const text = addText(button, 'span', formatGrams(entry.analysis.total.carbs_best_g) + ' g · ' + entry.analysis.items.map(item => item.name).join(', '));
    addText(text, 'small', date + (entry.image ? '' : ' · Oud resultaat zonder foto'));
    button.addEventListener('click', () => {
      if (state.mode !== 'idle' || state.pendingDraft) return;
      const open = () => {
        clearResult(); state.image = entry.image || null; $('description').value = entry.description || '';
        state.analysis = entry.analysis; state.historical = !entry.image; state.savedMealId = entry.id;
        state.retry = false; showPreview(); status('');
        renderAnalysis(entry.analysis, 'Bewaarde maaltijd van ' + date + (entry.image ? '.' : '. Bij dit oude resultaat is geen foto bewaard.'));
        saveDraft();
      };
      if ((state.image || $('description').value) && !state.savedMealId) {
        confirmDelete('Uw huidige maaltijd is nog niet bewaard. Wilt u toch de bewaarde maaltijd openen?', open, 'Maaltijd openen?', 'Openen');
      } else open();
    });
  }
  syncUI();
}
function stopTracks(stream) { stream?.getTracks().forEach(track => track.stop()); }
function cancelWork() {
  state.operation++;
  state.controller?.abort(); state.controller = null;
  const recording = state.recording;
  state.recording = null;
  if (recording) {
    recording.cancelled = true;
    clearInterval(recording.timer);
    if (recording.recorder?.state === 'recording') recording.recorder.stop();
    stopTracks(recording.stream);
  }
  setMode('idle');
}
async function toggleRecording() {
  if (state.mode === 'recording') {
    clearInterval(state.recording.timer);
    setMode('transcribing'); state.recording.recorder.stop(); return;
  }
  if (state.mode !== 'idle' || !online() || !speechSupported() || state.pendingDraft) return;
  const operation = ++state.operation;
  const recording = { cancelled: false, stream: null, recorder: null, timer: null, chunks: [] };
  state.recording = recording;
  setMode('permission'); status('Geef toestemming voor de microfoon om in te spreken.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    if (operation !== state.operation || recording.cancelled) { stopTracks(stream); return; }
    recording.stream = stream;
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
    const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
    recording.recorder = recorder;
    recorder.addEventListener('dataavailable', event => { if (event.data.size) recording.chunks.push(event.data); });
    recorder.addEventListener('error', () => {
      if (operation !== state.operation) return;
      cancelWork(); status('De opname werd onderbroken. Probeer opnieuw of typ uw beschrijving.', 'error');
    });
    recorder.addEventListener('stop', () => finishRecording(recording, operation), { once: true });
    recorder.start(); recording.startedAt = Date.now();
    setMode('recording'); status('Opname loopt. Tik op Stop opname als u klaar bent.');
    $('recordTimer').textContent = '0:00 / 0:45';
    recording.timer = setInterval(() => {
      const seconds = Math.min(45, Math.floor((Date.now() - recording.startedAt) / 1000));
      $('recordTimer').textContent = `0:${String(seconds).padStart(2, '0')} / 0:45`;
      if (seconds >= 45 && recorder.state === 'recording') { clearInterval(recording.timer); setMode('transcribing'); recorder.stop(); }
    }, 250);
  } catch (error) {
    stopTracks(recording.stream);
    if (operation !== state.operation) return;
    state.recording = null; setMode('idle');
    status(error.name === 'NotAllowedError' ? 'Microfoontoegang is geweigerd. U kunt toestemming wijzigen in de browserinstellingen of de beschrijving typen.' : 'De microfoon is niet beschikbaar. Probeer opnieuw of typ uw beschrijving.', 'error');
  }
}
async function finishRecording(recording, operation) {
  clearInterval(recording.timer); stopTracks(recording.stream);
  if (recording.cancelled || operation !== state.operation) return;
  const type = recording.recorder.mimeType || 'audio/webm';
  const blob = new Blob(recording.chunks, { type });
  state.recording = null;
  const controller = new AbortController(); state.controller = controller;
  setMode('transcribing'); status('Uw opname wordt omgezet naar tekst…');
  try {
    if (!blob.size) throw new Error('Er is geen opname ontvangen. Probeer opnieuw.');
    if (blob.size > 5 * 1024 * 1024) throw new Error('Deze opname is te groot. Spreek een kortere beschrijving in.');
    const form = new FormData();
    form.append('audio', blob, `opname.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`);
    const data = await requestJson('/api/whisper', { method: 'POST', body: form }, controller);
    if (operation !== state.operation) return;
    if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('Er werd geen duidelijke spraak herkend. Probeer opnieuw.');
    const combined = [$('description').value.trim(), data.text.trim()].filter(Boolean).join(' ');
    $('description').value = combined.slice(0, 800);
    markResultDirty(); saveDraft();
    status(combined.length > 800 ? 'De tekst is toegevoegd, maar ingekort tot 800 tekens. Controleer uw beschrijving.' : 'Uw tekst is toegevoegd. Controleer de porties en tik op Analyseer maaltijd.', 'success');
  } catch (error) {
    if (operation === state.operation) status(error.name === 'AbortError' ? 'Opname geannuleerd.' : error.message, 'error');
  } finally { if (operation === state.operation) { state.controller = null; setMode('idle'); } }
}
function resetApp() {
  cancelWork(); clearTimeout(saveTimer);
  state.image = null; state.pendingDraft = null; state.retry = false;
  $('restoreNotice').hidden = true;
  $('cameraInput').value = ''; $('fileInput').value = ''; $('description').value = '';
  clearResult(); showPreview();
  persist(() => localData.delete('draft'));
  status(''); syncUI(); focusAndScroll('scanner-title');
}
function confirmDelete(text, action, title = 'Bewaarde gegevens verwijderen?', label = 'Verwijderen') {
  $('confirmTitle').textContent = title; $('confirmAccept').textContent = label;
  confirmAction = action; $('confirmText').textContent = text; $('confirmDialog').showModal();
}
async function clearSavedData() {
  state.remember = false; storageSet(REMEMBER_KEY, '0'); $('rememberToggle').checked = false;
  clearTimeout(saveTimer); state.pendingDraft = null;
  $('restoreNotice').hidden = true;
  const cleared = await persist(() => localData.clear());
  if (cleared) { state.history = []; state.savedMealId = null; }
  renderHistory(); syncUI();
  status(cleared ? 'Bewaarde maaltijden zijn verwijderd. Uw gratis scans blijven behouden.' : 'Verwijderen uit de toestelopslag is niet gelukt. Probeer opnieuw of wis de sitegegevens via uw browser.', cleared ? 'success' : 'error');
}
async function initializeStorage() {
  state.remember = storageGet(REMEMBER_KEY) === '1';
  $('rememberToggle').checked = state.remember;
  try {
    {
      const history = await localData.get('history');
      state.history = (Array.isArray(history) ? history : []).slice(0, 10).flatMap(entry => {
        if (LOCAL_PREVIEW && entry?.source !== 'live-v1') return []; // Never present old demo output as a real scan.
        try {
          if (!Number.isFinite(entry.date) || typeof entry.id !== 'string') return [];
          const image = validDraft({ version: 1, savedAt: Date.now(), description: '', image: entry.image }) ? entry.image : null;
          const description = typeof entry.description === 'string' ? entry.description.slice(0, 800) : '';
          return [{ ...entry, image, description, analysis: normalizeAnalysis(entry.analysis) }];
        } catch { return []; }
      });
    }
    if (state.remember) {
      const draft = await localData.get('draft');
      if (validDraft(draft)) { state.pendingDraft = { ...draft, analysis: LOCAL_PREVIEW && draft.source !== 'live-v1' ? null : draft.analysis }; $('restoreNotice').hidden = false; }
      else await localData.delete('draft');
    } else await localData.delete('draft');
  } catch { status('Bewaarde maaltijden konden niet worden geladen. U kunt wel een nieuwe maaltijd scannen.', 'error'); }
  setMode('idle'); renderHistory();
}
function setupInstallation() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').then(registration => {
      const ready = () => { if (registration.waiting) { waitingWorker = registration.waiting; $('updateNotice').hidden = false; } };
      ready();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) ready(); });
      });
      window.addEventListener('online', () => registration.update().catch(() => {}));
    }).catch(() => status('Offline openen is in deze browser niet beschikbaar. Online kunt u de app blijven gebruiken.'));
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested) location.reload(); });
  }
  $('updateBtn').addEventListener('click', async () => {
    if (state.mode !== 'idle' || !waitingWorker || state.pendingDraft) return;
    if (!state.remember && (state.image || $('description').value)) {
      status('Rond uw maaltijd af en kies Nieuwe maaltijd voordat u bijwerkt, of schakel sessieopslag in bij Privacy & bewaren.'); return;
    }
    const saved = await saveDraft();
    if (state.remember && (state.image || $('description').value) && saved === false) {
      status('Bijwerken is uitgesteld: uw maaltijd kon niet worden bewaard. Rond eerst uw maaltijd af en kies Nieuwe maaltijd.', 'error'); return;
    }
    updateRequested = true; waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });
}

const helpTopics = {
  cameraHelpBtn: ['Maak foto', 'Maak een nieuwe foto van uw maaltijd met de camera van uw gsm. Zorg dat het volledige bord goed zichtbaar is.'],
  fileHelpBtn: ['Kies foto', 'Kies een bestaande foto van uw maaltijd uit de foto’s op uw toestel.'],
  recordHelpBtn: ['Spreek in', 'Noem ingrediënten of hoeveelheden die u wilt toevoegen. Tik nogmaals om te stoppen. Uw woorden verschijnen als tekst bij Extra informatie.'],
  portionHelpBtn: ['Portie verduidelijken', 'Pas de hoeveelheid of ingrediënten aan bij Extra informatie. Kies daarna Opnieuw analyseren om de schatting met dezelfde foto bij te werken.'],
  descriptionHelpBtn: ['Extra informatie (optioneel)', 'Vermeld wat niet duidelijk op de foto staat, zoals saus, drank of een bekend gewicht. U kunt dit typen of inspreken. Dit veld mag leeg blijven.'],
};
for (const [id, [title, explanation]] of Object.entries(helpTopics)) {
  $(id).addEventListener('click', () => {
    $('helpTitle').textContent = title;
    $('helpText').textContent = explanation;
    $('helpDialog').showModal();
  });
}
$('closeHelpBtn').addEventListener('click', () => $('helpDialog').close());

$('cameraInput').addEventListener('change', selectImage);
$('fileInput').addEventListener('change', selectImage);
$('description').addEventListener('input', () => { markResultDirty(); state.retry = false; syncUI(); scheduleSave(); });
$('analyzeButton').addEventListener('click', analyze);
$('recordBtn').addEventListener('click', toggleRecording);
$('cancelRecordBtn').addEventListener('click', () => { cancelWork(); status('Opname geannuleerd. Er wordt geen tekst toegevoegd.'); });
$('cancelAnalysisBtn').addEventListener('click', () => { cancelWork(); state.retry = true; syncUI(); status('Analyse geannuleerd. Uw foto en tekst blijven staan.'); });
$('resetBtn').addEventListener('click', resetApp);
$('newMealBtn').addEventListener('click', resetApp);
$('correctPortionBtn').addEventListener('click', () => {
  if (state.mode !== 'idle' || !state.image || state.historical) return;
  status('');
  focusAndScroll('description');
});
$('mealsBtn').addEventListener('click', () => { $('historyPanel').open = true; $('settingsDialog').showModal(); });
$('saveMealBtn').addEventListener('click', saveMeal);
$('closeSettingsBtn').addEventListener('click', () => $('settingsDialog').close());
$('refillBtn').addEventListener('click', () => { $('refillCode').value = ''; $('refillError').hidden = true; $('refillDialog').showModal(); });
$('refillCancel').addEventListener('click', () => $('refillDialog').close());
$('refillForm').addEventListener('submit', event => {
  event.preventDefault();
  if ($('refillCode').value.trim() !== FEEDBACK_CODE) { $('refillError').textContent = 'Deze code is niet correct. Controleer de code uit uw e-mail.'; $('refillError').hidden = false; return; }
  state.credits = Infinity;
  const saved = storageSet(CREDIT_KEY, creditValue(Infinity));
  state.creditStorageBlocked = !saved;
  $('refillDialog').close(); refreshCredits(); syncUI();
  status(saved ? 'Bedankt voor uw feedback! Onbeperkt gratis scans is geactiveerd op dit toestel.' : 'Onbeperkt gratis scans is actief voor deze sessie. Uw browser blokkeert het bewaren van de code.', 'success');
});
$('feedbackLink').href = `mailto:fredje4711@gmail.com?subject=${encodeURIComponent('Feedback Koolhydraten Scanner')}&body=${encodeURIComponent('Hallo Freddy,\n\nMijn ervaring met de scanner:\n\nWat vond ik goed?\n\nWat kan beter?\n\nIk ontvang graag een code voor onbeperkt gratis scans.\n')}`;
$('restoreBtn').addEventListener('click', () => {
  const draft = state.pendingDraft;
  if (!draft || !validDraft(draft)) { state.pendingDraft = null; $('restoreNotice').hidden = true; persist(() => localData.delete('draft')); syncUI(); return; }
  state.image = draft.image; $('description').value = draft.description;
  state.pendingDraft = null; $('restoreNotice').hidden = true; showPreview();
  try { if (draft.analysis && state.image) { state.analysis = normalizeAnalysis(draft.analysis); renderAnalysis(state.analysis); } } catch { clearResult(); }
  status('Uw vorige maaltijd is hersteld.', 'success'); syncUI();
});
$('discardDraftBtn').addEventListener('click', resetApp);
$('rememberToggle').addEventListener('change', async () => {
  if (!$('rememberToggle').checked) {
    state.remember = false; storageSet(REMEMBER_KEY, '0'); clearTimeout(saveTimer);
    await persist(() => localData.delete('draft')); return;
  }
  state.remember = true;
  if (!storageSet(REMEMBER_KEY, '1')) { state.remember = false; $('rememberToggle').checked = false; status('Deze browser blokkeert opslag. Bewaren kan niet worden ingeschakeld.', 'error'); return; }
  storageWarningShown = false; saveDraft(); renderHistory();
});
$('clearDataBtn').addEventListener('click', () => confirmDelete('Verwijder de bewaarde sessie en alle recente maaltijden op dit toestel. De scanteller blijft behouden.', clearSavedData));
$('clearHistoryBtn').addEventListener('click', () => confirmDelete('Verwijder alle recente maaltijden op dit toestel. Uw huidige maaltijd blijft staan.', async () => { if (await persist(() => localData.delete('history'))) { state.history = []; state.savedMealId = null; } renderHistory(); }));
$('confirmCancel').addEventListener('click', () => { confirmAction = null; $('confirmDialog').close(); });
$('confirmAccept').addEventListener('click', () => { const action = confirmAction; confirmAction = null; $('confirmDialog').close(); action?.(); });
$('confirmDialog').addEventListener('cancel', () => { confirmAction = null; });
window.addEventListener('storage', event => {
  if (event.key === CREDIT_KEY || event.key === null) { state.credits = parseCredits(storageGet(CREDIT_KEY)); state.creditStorageBlocked = false; refreshCredits(); syncUI(); }
  if ((event.key === REMEMBER_KEY || event.key === null) && storageGet(REMEMBER_KEY) !== '1') {
    state.remember = false; $('rememberToggle').checked = false; clearTimeout(saveTimer);
    state.pendingDraft = null; $('restoreNotice').hidden = true;
    persist(() => localData.delete('draft')); syncUI();
  }
});
window.addEventListener('offline', () => { if (['analyzing', 'transcribing', 'permission', 'recording'].includes(state.mode)) { cancelWork(); state.retry = Boolean(state.image); status('De verbinding is weggevallen. Uw foto en tekst blijven staan.', 'error'); } syncUI(); });
window.addEventListener('online', syncUI);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (['permission', 'recording'].includes(state.mode)) { cancelWork(); status('De opname is geannuleerd omdat de app naar de achtergrond ging. Spreek opnieuw in als u klaar bent.'); }
    saveDraft();
  }
});
window.addEventListener('pagehide', () => { if (state.mode !== 'idle') cancelWork(); saveDraft(); });
function keyboardChanged() {
  const editing = ['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName);
  const viewport = window.visualViewport;
  document.body.classList.toggle('keyboard-open', Boolean(editing && viewport && innerHeight - viewport.height > 120));
}
window.visualViewport?.addEventListener('resize', keyboardChanged);
document.addEventListener('focusin', keyboardChanged); document.addEventListener('focusout', keyboardChanged);
refreshCredits(); syncUI(); setupInstallation(); initializeStorage();
