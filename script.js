document.addEventListener("DOMContentLoaded", () => {

// ---------- FOTO PREVIEW + OPSLAG ----------
const cameraInput = document.getElementById('cameraInput');
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
let currentImageData = null;

async function handleImageSelection(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
    currentImageData = await resizeImage(file, 1024);
  }
}

cameraInput.addEventListener('change', handleImageSelection);
fileInput.addEventListener('change', handleImageSelection);


// ---------- SPRAAKHERKENNING ----------
const micButton = document.getElementById('micButton');
const description = document.getElementById('description');

if (micButton) {
  let recognition;
  let recognizing = false;
  let stopTimer;

  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'nl-NL';
    recognition.interimResults = false;
    recognition.continuous = true; 
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      description.value += (description.value ? ' ' : '') + transcript;
    };

    recognition.onend = () => {
      clearTimeout(stopTimer);
      recognizing = false;
      micButton.textContent = '🎙️ Start spraak';
    };

    recognition.onerror = () => {
      clearTimeout(stopTimer);
      recognizing = false;
      micButton.textContent = '🎙️ Start spraak';
    };

    micButton.addEventListener('click', () => {
      if (!recognition) return;
      if (recognizing) {
        recognition.stop();
        clearTimeout(stopTimer);
        recognizing = false;
        micButton.textContent = '🎙️ Start spraak';
      } else {
        recognition.start();
        recognizing = true;
        micButton.textContent = '🛑 Stop opname';
      }
    });
  } else {
    micButton.disabled = true;
    micButton.textContent = '🎙️ Niet ondersteund';
  }
}


 // ---------- AUDIO OPNAME via Whisper ----------
  const recordBtn = document.getElementById('recordBtn');
  const descriptionBox = document.getElementById('description');
  let mediaRecorder;
  let audioChunks = [];
  let stream = null;
  let audioContext = null;
  let oscillator = null;
  let keepAliveGain = null;

  recordBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
      setTimeout(() => {
        recordBtn.textContent = "🎤 Inspreken";
        recordBtn.classList.remove("recording");
      }, 500);
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
      });

      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        oscillator = audioContext.createOscillator();
        keepAliveGain = audioContext.createGain();
        keepAliveGain.gain.value = 0.00001; 
        oscillator.connect(keepAliveGain).connect(audioContext.destination);
        oscillator.start();
      } catch (e) { console.warn("Silent-tone fout:", e); }

      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', blob, 'opname.webm');

        try {
          const response = await fetch('https://carbo-app.vercel.app/api/whisper', {
            method: 'POST',
            body: formData
          });
          const data = await response.json();
          if (data.text) {
            descriptionBox.value += (descriptionBox.value ? ' ' : '') + data.text;
          }
        } catch (err) {
          alert("Er ging iets mis bij de verwerking van de opname.");
        }

        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          stream = null;
        }
        if (oscillator) { try { oscillator.stop(); } catch(e){} oscillator = null; }
        if (audioContext) { try { audioContext.close(); } catch(e){} audioContext = null; }
        recordBtn.textContent = "🎤 Inspreken";
        recordBtn.classList.remove("recording");
      };

      mediaRecorder.start();
      recordBtn.textContent = "🛑 Stop opname";
      recordBtn.classList.add("recording");

    } catch (err) {
      alert("Microfoon niet beschikbaar of toestemming geweigerd.");
    }
  });

// ---------- FOTO VERKLEINING ----------
async function resizeImage(file, maxSize) {
  return new Promise((resolve) => {
    const img = document.createElement('img');
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    reader.readAsDataURL(file);
  });
}

// ---------- GPT-4o VISION ANALYSE ----------
const analyzeButton = document.getElementById('analyzeButton');
const resultText = document.getElementById('resultText');

analyzeButton.addEventListener('click', async () => {
  if (!currentImageData) {
    alert('Maak of kies eerst een foto.');
    return;
  }

  resultText.textContent = '🔄 Foto wordt geanalyseerd... even geduld...';

  const prompt = `
Analyseer deze maaltijdfoto en schat per onderdeel het aantal koolhydraten (gram).
Gebruik duidelijke opsomming en totaal. Beschrijving gebruiker: ${description.value || "(geen)"}.
`;

  try {
    const response = await fetch("https://carbo-app.vercel.app/api/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: currentImageData } }
            ]
          }
        ]
      })
    });

    if (!response.ok) throw new Error(`API-fout: ${response.status}`);
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || "Geen antwoord ontvangen.";
    resultText.textContent = answer;

  } catch (err) {
    resultText.textContent = "❌ Fout bij analyse: " + err.message;
  }
});

// ---------- Popup "Meer uitleg…" ----------
const infoLink = document.getElementById("infoLink");
const infoPopup = document.getElementById("infoPopup");
const closePopup = document.getElementById("closePopup");

if (infoLink && infoPopup && closePopup) {
  infoLink.addEventListener("click", () => { infoPopup.style.display = "block"; });
  closePopup.addEventListener("click", () => { infoPopup.style.display = "none"; });
  infoPopup.addEventListener("click", (e) => {
    if (e.target === infoPopup) { infoPopup.style.display = "none"; }
  });
}

// ---------- RESET-FUNCTIE ----------
const resetBtn = document.getElementById("resetBtn");
if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    currentImageData = null;
    const preview = document.getElementById("preview");
    if (preview) preview.src = "";
    const cameraInput = document.getElementById("cameraInput");
    const fileInput = document.getElementById("fileInput");
    if (cameraInput) cameraInput.value = "";
    if (fileInput) fileInput.value = "";
    const descriptionBox = document.getElementById("description");
    if (descriptionBox) descriptionBox.value = "";
    const resultText = document.getElementById("resultText");
    if (resultText) { resultText.textContent = "Nog geen analyse uitgevoerd."; }
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ------------------------------------------------
//  CREDITSYSTEEM + GEHEIM BEHEERDERSMENU
// ------------------------------------------------
let maxCredits = 50;
let secretClicks = 0;
let secretTimer;

function loadCredits() {
  let c = localStorage.getItem("carbo_credits");
  if (c === null) {
    localStorage.setItem("carbo_credits", maxCredits);
    return maxCredits;
  }
  return parseInt(c, 10);
}

function saveCredits(v) {
  localStorage.setItem("carbo_credits", v);
}

function updateCreditDisplay() {
  const box = document.getElementById("creditCount");
  const wrapper = document.getElementById("creditBox");
  const info = document.getElementById("creditInfo");
  if (!box || !wrapper || !info) return;

  let c = loadCredits();
  box.textContent = c;

  wrapper.style.color = (c === 0) ? "red" : (c <= 10 ? "#d98200" : "black");

  if (c === 0) {
    info.textContent = "⛔ Uw tegoed is opgebruikt. Mail naar fredje_s@skynet.be voor een nieuw tegoed.";
    info.className = "credit-info zero";
  } else if (c <= 5) {
    info.textContent = "⚠️ Je gratis scans zijn bijna opgebruikt. Mail naar fredje_s@skynet.be voor meer gratis scans.";
    info.className = "credit-info warning";
  } else {
    info.textContent = "ℹ️ Elke analyse verbruikt 1 gratis credit. Je kreeg er 50 gratis.";
    info.className = "credit-info";
  }
}

// ---------- GEHEIM BEHEERDERS-MENU ----------
const creditTrigger = document.getElementById("creditBox");
if (creditTrigger) {
  // MAAK DE KLIKZONE GROTER EN VOORKOM SELECTIE
  creditTrigger.style.padding = "15px"; // Extra ruimte om makkelijker te klikken
  creditTrigger.style.margin = "-15px"; // Voorkom dat de tekst verspringt door de padding
  creditTrigger.style.display = "inline-block";
  creditTrigger.style.userSelect = "none";
  creditTrigger.style.webkitUserSelect = "none";

  creditTrigger.addEventListener("click", () => {
    secretClicks++;
    clearTimeout(secretTimer);
    secretTimer = setTimeout(() => { secretClicks = 0; }, 3000); 

    if (secretClicks >= 5) {
      let code = prompt("Beheerdersmodus: Voer de herlaadcode in:");
      if (code === "1947") { 
        saveCredits(100);
        updateCreditDisplay();
        alert("Het tegoed is succesvol herladen naar 100 scans.");
      } else if (code !== null) {
        alert("Onjuiste code.");
      }
      secretClicks = 0;
    }
  });
}

function useCredit() {
  let c = loadCredits();
  if (c <= 0) return false;
  c--;
  saveCredits(c);
  updateCreditDisplay();
  return true;
}

function checkCreditBeforeAnalysis() {
  let c = loadCredits();
  if (c <= 0) {
    alert("Uw tegoed is opgebruikt.\n\nStuur een e-mail naar fredje_s@skynet.be om nieuwe gratis scans te ontvangen.");
    return false;
  }
  return true;
}

// ANALYSE-KNOP LOGICA
analyzeButton.addEventListener("click", async (event) => {
  if (!currentImageData) {
    alert("Maak of kies eerst een foto.");
    event.stopImmediatePropagation();
    return;
  }
  if (!checkCreditBeforeAnalysis()) {
    event.stopImmediatePropagation();
    return;
  }
  if (!useCredit()) {
    event.stopImmediatePropagation();
    return;
  }
}, { capture: true });

updateCreditDisplay();

});