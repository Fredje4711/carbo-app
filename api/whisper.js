export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  // Alleen POST toestaan
  if (req.method !== "POST") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.status(405).json({ error: "Use POST" });
    return;
  }

  try {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

    // Lees multipart-formdata
    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile) {
      return res.status(400).json({ error: "Geen audio ontvangen" });
    }

    // Stuur naar OpenAI Whisper
    const whisperReq = new FormData();
    whisperReq.append("file", audioFile);
    whisperReq.append("model", "whisper-1");

    const openaiResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: whisperReq,
    });

    if (!openaiResp.ok) {
      const errTxt = await openaiResp.text();
      console.error("Whisper-API fout:", errTxt);
      return res.status(500).json({ error: "Whisper-API mislukt", detail: errTxt });
    }

    const data = await openaiResp.json();
    res.status(200).json(data);
  } catch (error) {
    console.error("Serverfout:", error);
    res.status(500).json({ error: error.message });
  }
}
