// ---------- FOTO PREVIEW + OPSLAG ----------
const cameraInput = document.getElementById('cameraInput');
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
let currentImageData = null;

async function handleImageSelection(event) {
  const file = event.target.files[0];
  if (file) {
    // toon preview
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);

    // verklein afbeelding vóór verzending
    currentImageData = await resizeImage(file, 1024);
  }
}

cameraInput.addEventListener('change', handleImageSelection);
fileInput.addEventListener('change', handleImageSelection);


// ---------- SPRAAKHERKENNING ----------
const micButton = document.getElementById('micButton');
const description = document.getElementById('description');
let recognition;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'nl-NL';
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    description.value += (description.value ? ' ' : '') + transcript;
  };

  recognition.onerror = (event) => alert('Spraakherkenning mislukt: ' + event.error);
} else {
  micButton.disabled = true;
  micButton.textContent = '🎙️ Niet ondersteund';
}

micButton.addEventListener('click', () => {
  if (recognition) recognition.start();
});

// ---------- FOTO VERKLEINING ----------
async function resizeImage(file, maxSize) {
  return new Promise((resolve) => {
    const img = document.createElement('img');
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85)); // 85 % kwaliteit
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
    const response = await fetch("https://carbo-proxy.fredje4711.workers.dev", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        
      },
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
  infoLink.addEventListener("click", () => {
    infoPopup.style.display = "block";
  });

  closePopup.addEventListener("click", () => {
    infoPopup.style.display = "none";
  });

  // sluiten bij tikken buiten de popup
  infoPopup.addEventListener("click", (e) => {
    if (e.target === infoPopup) {
      infoPopup.style.display = "none";
    }
  });
}

