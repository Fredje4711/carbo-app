const API_BASE = location.hostname.endsWith("github.io") ? "https://carbo-app.vercel.app" : "";
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_RECORDING_MS = 45_000;
const REQUEST_TIMEOUT_MS = 55_000;
const SUPPORTED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp"]);

const elements = {
  cameraInput: document.getElementById("cameraInput"),
  fileInput: document.getElementById("fileInput"),
  preview: document.getElementById("preview"),
  previewWrap: document.getElementById("previewWrap"),
  description: document.getElementById("description"),
  charCount: document.getElementById("charCount"),
  recordBtn: document.getElementById("recordBtn"),
  resetBtn: document.getElementById("resetBtn"),
  analyzeButton: document.getElementById("analyzeButton"),
  status: document.getElementById("statusMessage"),
  resultSection: document.getElementById("resultSection"),
  totalBest: document.getElementById("totalBest"),
  totalRange: document.getElementById("totalRange"),
  totalConfidence: document.getElementById("totalConfidence"),
  summary: document.getElementById("summaryText"),
  items: document.getElementById("itemsList"),
  assumptionsSection: document.getElementById("assumptionsSection"),
  assumptions: document.getElementById("assumptionsList"),
  questionSection: document.getElementById("questionSection"),
  question: document.getElementById("followUpQuestion"),
  safety: document.getElementById("safetyNote"),
};

let currentImageData = null;
let previewUrl = null;
let analysisController = null;
let mediaRecorder = null;
let mediaStream = null;
let recordingTimer = null;
let audioChunks = [];

function setStatus(message, type = "info") {
  elements.status.textContent = message;
  elements.status.dataset.type = type;
  elements.status.hidden = !message;
}

function setAnalyzing(active) {
  elements.analyzeButton.disabled = active || !currentImageData;
  elements.analyzeButton.classList.toggle("loading", active);
  elements.analyzeButton.textContent = active ? "Analyseren…" : "Analyseer";
  elements.cameraInput.disabled = active;
  elements.fileInput.disabled = active;
  elements.resetBtn.disabled = active;
}

function setPreview(file) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  elements.preview.src = previewUrl;
  elements.previewWrap.hidden = false;
}

function canvasToDataUrl(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("De afbeelding kon niet worden verkleind."));
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("De afbeelding kon niet worden gelezen."));
      reader.readAsDataURL(blob);
    }, "image/jpeg", 0.84);
  });
}

async function resizeImage(file, maxDimension = 1280) {
  const decoded = await decodeImage(file);
  try {
    const scale = Math.min(maxDimension / decoded.width, maxDimension / decoded.height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    return await canvasToDataUrl(canvas);
  } finally {
    decoded.close();
  }
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(file);
    }
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Deze foto kan niet door de browser worden gelezen."));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function handleImageSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!SUPPORTED_IMAGES.has(file.type)) {
    event.target.value = "";
    setStatus("Kies een JPEG-, PNG- of WebP-afbeelding.", "error");
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    event.target.value = "";
    setStatus("Deze foto is groter dan 12 MB. Kies een kleinere foto.", "error");
    return;
  }

  elements.analyzeButton.disabled = true;
  setStatus("Foto wordt klaargemaakt…");
  try {
    currentImageData = await resizeImage(file);
    setPreview(file);
    elements.resultSection.hidden = true;
    elements.analyzeButton.disabled = false;
    setStatus("Foto gereed. Voeg eventueel informatie toe en tik op Analyseer.", "success");
  } catch (error) {
    currentImageData = null;
    event.target.value = "";
    setStatus(error.message || "Deze foto kon niet worden verwerkt.", "error");
  }
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function confidenceLabel(value) {
  if (value === "hoog") return "Hoge zekerheid";
  if (value === "middel") return "Redelijke zekerheid";
  return "Lage zekerheid";
}

function addTextElement(parent, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function renderAnalysis(analysis) {
  const total = analysis?.total || {};
  const items = Array.isArray(analysis?.items) ? analysis.items : [];
  const assumptions = Array.isArray(analysis?.assumptions) ? analysis.assumptions : [];

  elements.totalBest.textContent = number(total.carbs_best_g);
  elements.totalRange.textContent = `${number(total.carbs_min_g)}–${number(total.carbs_max_g)} g`;
  elements.totalConfidence.textContent = confidenceLabel(total.confidence);
  elements.totalConfidence.dataset.level = total.confidence || "laag";
  elements.summary.textContent = analysis?.summary || "De maaltijd kon slechts beperkt worden beoordeeld.";

  elements.items.replaceChildren();
  if (!analysis?.meal_detected || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-result";
    empty.textContent = "Er werd geen duidelijke maaltijd herkend. Probeer een andere foto.";
    elements.items.appendChild(empty);
  } else {
    for (const item of items) {
      const card = document.createElement("article");
      card.className = "food-item";
      const heading = document.createElement("div");
      heading.className = "food-heading";
      addTextElement(heading, "h3", "", item.name || "Onderdeel");
      addTextElement(heading, "strong", "food-carbs", `${number(item.carbs_best_g)} g`);
      card.appendChild(heading);
      addTextElement(card, "p", "portion", item.portion || "Portie onbekend");
      addTextElement(card, "p", "range", `Geschat bereik: ${number(item.carbs_min_g)}–${number(item.carbs_max_g)} g`);
      addTextElement(card, "p", "reasoning", item.reasoning || "Geen aanvullende uitleg.");
      addTextElement(card, "span", `mini-confidence ${item.confidence || "laag"}`, confidenceLabel(item.confidence));
      elements.items.appendChild(card);
    }
  }

  elements.assumptions.replaceChildren();
  for (const assumption of assumptions) addTextElement(elements.assumptions, "li", "", assumption);
  elements.assumptionsSection.hidden = assumptions.length === 0;

  const question = String(analysis?.follow_up_question || "").trim();
  elements.question.textContent = question;
  elements.questionSection.hidden = !question;
  elements.safety.textContent = analysis?.safety_note || "Dit resultaat is indicatief en niet bedoeld voor zelfstandige insulinedosering.";
  elements.resultSection.hidden = false;
  elements.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function analyzeMeal() {
  if (!currentImageData || analysisController) return;

  analysisController = new AbortController();
  const timeout = setTimeout(() => analysisController?.abort(), REQUEST_TIMEOUT_MS);
  setAnalyzing(true);
  setStatus("De maaltijd wordt geanalyseerd. Dit kan enkele seconden duren…");

  try {
    const response = await fetch(`${API_BASE}/api/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: analysisController.signal,
      body: JSON.stringify({
        image: currentImageData,
        description: elements.description.value.trim(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `De server antwoordde met status ${response.status}.`);
    if (!data.analysis) throw new Error("Er werd geen bruikbaar resultaat ontvangen.");

    renderAnalysis(data.analysis);
    setStatus("Analyse voltooid.", "success");
  } catch (error) {
    const message = error.name === "AbortError"
      ? "De analyse duurde te lang. Controleer uw verbinding en probeer opnieuw."
      : error.message || "Er ging iets mis tijdens de analyse.";
    setStatus(message, "error");
  } finally {
    clearTimeout(timeout);
    analysisController = null;
    setAnalyzing(false);
  }
}

function supportedRecordingType() {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function stopMediaTracks() {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
}

function resetRecordButton() {
  clearTimeout(recordingTimer);
  elements.recordBtn.classList.remove("recording");
  elements.recordBtn.disabled = false;
  elements.recordBtn.innerHTML = '<span aria-hidden="true">🎤</span> Spreek beschrijving in';
}

async function transcribeRecording(blob, mimeType) {
  elements.recordBtn.disabled = true;
  elements.recordBtn.textContent = "Omzetten naar tekst…";
  setStatus("De opname wordt omgezet naar tekst…");

  try {
    const formData = new FormData();
    const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
    formData.append("audio", blob, `opname.${extension}`);
    const response = await fetch(`${API_BASE}/api/whisper`, { method: "POST", body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "De opname kon niet worden verwerkt.");

    if (data.text) {
      const separator = elements.description.value.trim() ? " " : "";
      elements.description.value = `${elements.description.value.trim()}${separator}${data.text}`.slice(0, 800);
      updateCharacterCount();
      setStatus("De ingesproken tekst is toegevoegd.", "success");
    } else {
      setStatus("Er werd geen duidelijke spraak herkend.", "error");
    }
  } catch (error) {
    setStatus(error.message || "De opname kon niet worden verwerkt.", "error");
  } finally {
    resetRecordButton();
  }
}

async function toggleRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    setStatus("Spraakopname wordt niet door deze browser ondersteund.", "error");
    return;
  }

  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const mimeType = supportedRecordingType();
    mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
    audioChunks = [];
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) audioChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", async () => {
      const actualType = mediaRecorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(audioChunks, { type: actualType });
      stopMediaTracks();
      await transcribeRecording(blob, actualType.split(";")[0]);
    }, { once: true });
    mediaRecorder.start();
    elements.recordBtn.classList.add("recording");
    elements.recordBtn.innerHTML = '<span aria-hidden="true">⏹</span> Stop opname';
    setStatus("Opname loopt… Tik opnieuw om te stoppen (maximaal 45 seconden).", "recording");
    recordingTimer = setTimeout(() => {
      if (mediaRecorder?.state === "recording") mediaRecorder.stop();
    }, MAX_RECORDING_MS);
  } catch {
    stopMediaTracks();
    resetRecordButton();
    setStatus("Microfoontoegang is geweigerd of niet beschikbaar.", "error");
  }
}

function updateCharacterCount() {
  elements.charCount.textContent = `${elements.description.value.length}/800`;
}

function resetApp() {
  analysisController?.abort();
  if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  currentImageData = null;
  elements.cameraInput.value = "";
  elements.fileInput.value = "";
  elements.description.value = "";
  updateCharacterCount();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  elements.preview.removeAttribute("src");
  elements.previewWrap.hidden = true;
  elements.resultSection.hidden = true;
  elements.analyzeButton.disabled = true;
  setStatus("");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

elements.cameraInput.addEventListener("change", handleImageSelection);
elements.fileInput.addEventListener("change", handleImageSelection);
elements.description.addEventListener("input", updateCharacterCount);
elements.analyzeButton.addEventListener("click", analyzeMeal);
elements.recordBtn.addEventListener("click", toggleRecording);
elements.resetBtn.addEventListener("click", resetApp);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((error) => console.warn("Serviceworker-fout", error));
  });
}

updateCharacterCount();
