// api/whisper.js
import Busboy from "busboy";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  // CORS toestaan
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    // 🟦 Lees multipart audio via Busboy
    const busboy = Busboy({ headers: req.headers });
    let fileBuffer = null;

    await new Promise((resolve, reject) => {
      busboy.on("file", (_, file) => {
        const chunks = [];
        file.on("data", (chunk) => chunks.push(chunk));
        file.on("end", () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });
      busboy.on("finish", resolve);
      busboy.on("error", reject);
      req.pipe(busboy);
    });

    if (!fileBuffer) {
      return res.status(400).json({ error: "Geen audiobestand ontvangen" });
    }

    // 🟩 Bouw formdata voor Whisper
    const formData = new FormData();
    formData.append("file", new Blob([fileBuffer]), "audio.webm");
    formData.append("model", "whisper-1");

    // 🟧 Vraag transcriptie aan OpenAI Whisper
    const openaiResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData,
    });

    const data = await openaiResp.json();

    if (!openaiResp.ok) {
      console.error("Whisper API-fout:", data);
      return res.status(500).json({ error: data });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("Serverfout:", err);
    res.status(500).json({ error: err.message });
  }
}
