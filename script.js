
document.addEventListener("DOMContentLoaded", () => {

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

if (micButton) {
  let recognition;
  let recognizing = false;
  let stopTimer;

  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
	recognition.continuous = true; // blijf luisteren, niet stoppen bij stilte

    recognition.lang = 'nl-NL';
    recognition.interimResults = false;
    recognition.continuous = true;  // ✅ deze regel dus toevoegen of op true zetten
    recognition.maxAlternatives = 1;


    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      description.value += (description.value ? ' ' : '') + transcript;
    };

 //   recognition.onstart = () => {
 //     recognizing = true;
 //     micButton.textContent = '🛑 Stop opname';
 //     clearTimeout(stopTimer);
 //     stopTimer = setTimeout(() => {
 //       if (recognizing) {
 //         recognition.stop();
 //         recognizing = false;
 //         micButton.textContent = '🎙️ Start spraak';
 //       }
 //     }, 12000);
 //   };

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



 // ---------- AUDIO OPNAME via MediaRecorder + Whisper ----------
  const recordBtn = document.getElementById('recordBtn');
  const descriptionBox = document.getElementById('description');
  let mediaRecorder;
  let audioChunks = [];
  let stream = null;

  recordBtn.addEventListener('click', async () => {
  // als er al een opname bezig is → stop deze netjes
  if (mediaRecorder && mediaRecorder.state === "recording") {
    console.log("🟥 Handmatig stoppen...");
    mediaRecorder.stop();

    // ⛔️ sluit de microfoon direct
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }

    // ⏱️ kleine vertraging zodat 'onstop' event eerst kan afwerken
setTimeout(() => {
  recordBtn.textContent = "🎤 Inspreken";
  recordBtn.classList.remove("recording"); // 🔵 zet terug blauw
}, 500);


    return;
  }

try {
  console.log("🟩 Start opname...");

  // Vraag audio aan met instellingen die voorkomen dat hij stopt bij stilte
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1
    }
  });

  // Houd de stream actief, ook bij stilte
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const silentNode = audioContext.createGain();
  silentNode.gain.value = 1.0; // constant signaal
  source.connect(silentNode);
  silentNode.connect(audioContext.destination);

  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

  mediaRecorder.onstop = async () => {
    console.log("🟦 Opname gestopt, verzenden naar Whisper...");
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', blob, 'opname.webm');

    try {
      const response = await fetch('https://carbo-app.vercel.app/api/whisper', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      console.log("🟪 Antwoord van Whisper:", data);

      if (data.text) {
        descriptionBox.value += (descriptionBox.value ? ' ' : '') + data.text;
      }
    } catch (err) {
      console.error("Fout bij verzenden naar Whisper:", err);
      alert("Er ging iets mis bij de verwerking van de opname.");
    }

    // microfoon volledig afsluiten na verwerking
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }

    recordBtn.textContent = "🎤 Inspreken";
    recordBtn.classList.remove("recording");
  };

  // Start opname
  mediaRecorder.start();
  recordBtn.textContent = "🛑 Stop opname";
  recordBtn.classList.add("recording");

} catch (err) {
  console.error("Microfoon niet beschikbaar of toestemming geweigerd:", err);
  alert("Microfoon niet beschikbaar of toestemming geweigerd.");
}

      // knop terugzetten (extra zekerheid)
      recordBtn.textContent = "🎤 Inspreken";
recordBtn.classList.remove("recording"); // 🔵 zet terug blauw

    };    

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
    const response = await fetch("https://carbo-app.vercel.app/api/proxy", {
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
}); // sluit DOMContentLoaded


