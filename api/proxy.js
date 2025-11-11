export default async function handler(req, res) {
  try {
    // Controleer dat het een POST-request is
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Alleen POST is toegestaan" });
    }

    // Lees de request body
    const body = await req.json ? await req.json() : JSON.parse(await req.text());

    // Controleer op model en berichten
    if (!body || !body.messages) {
      return res.status(400).json({ ok: false, error: "Ongeldige aanvraagstructuur" });
    }

    // Stuur door naar OpenAI API
    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: body.model || "gpt-4o-mini",
        messages: body.messages,
        temperature: 0.5,
        response_format: { type: "json_object" }, // Vraag altijd JSON terug
      }),
    });

    const rawText = await openAIResponse.text();

    // 🔍 Log alles wat we ontvangen hebben
    console.log("DEBUG OpenAI-response:", rawText.slice(0, 500)); // alleen eerste 500 tekens

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.warn("⚠️ Kon JSON niet parsen:", e.message);
      return res.status(500).json({
        ok: false,
        error: "OpenAI antwoord was geen geldige JSON",
        raw: rawText.slice(0, 300),
      });
    }

    // Controleer of we een geldige message hebben
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return res.status(500).json({
        ok: false,
        error: "Geen geldige message in OpenAI antwoord",
        debug: data,
      });
    }

    // ✅ Alles ok
    res.status(200).json({
      ok: true,
      message: data.choices[0].message.content,
    });
  } catch (err) {
    console.error("💥 Proxyfout:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
