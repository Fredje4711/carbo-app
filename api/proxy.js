module.exports = async (req, res) => {
  // --- CORS preflight ---
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  try {
    // ✅ JSON-body zelf ontleden (Vercel parse’t req.body niet automatisch)
    const bodyText = await new Promise(resolve => {
      let data = "";
      req.on("data", chunk => (data += chunk));
      req.on("end", () => resolve(data));
    });

    const { imageBase64, description } = JSON.parse(bodyText || "{}");
    if (!imageBase64) throw new Error("Geen afbeelding ontvangen.");
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ontbreekt in Vercel.");

    // --- Prompt voor consistente JSON-output ---
    const prompt = `
Je krijgt een foto van een maaltijd en optioneel een korte beschrijving.
BEPAAL de koolhydraten per onderdeel en geef ALLEEN JSON terug met dit schema:

{
  "items": [
    { "label": "Frietjes", "grams": 40 },
    { "label": "Steak", "grams": 0 },
    { "label": "Saus", "grams": 2 },
    { "label": "Salade", "grams": 3 }
  ],
  "notes": "Korte opmerking indien nuttig (max 1 zin)."
}

Regels:
- label kort en NL.
- grams = één getal in gram (integer of 1 decimaal). GEEN range; als de analyse een range geeft, kies de BOVENSTE waarde.
- Tel geen niet-koolhydraat-onderdelen mee (vlees e.d. vaak 0 g).
- Geen extra tekst buiten het JSON-object.
`;

    // --- OpenAI-aanroep ---
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Je bent een strikte parser die alleen geldig JSON retourneert." },
          { role: "user", content: prompt },
          {
            role: "user",
            content: [
              { type: "text", text: description || "" },
              // 🔁 Belangrijk: vision payload zoals je werkende variant vroeger
              { type: "image_url", image_url: { url: imageBase64 } }
            ]
          }
        ],
      }),
    });

    // ↪️ Heldere foutmelding bij API-fout
    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      throw new Error(`OpenAI ${openaiRes.status}: ${errText}`);
    }

    const openaiJson = await openaiRes.json();
    const raw = openaiJson?.choices?.[0]?.message?.content ?? "{}";

    // --- Veilig parsen ---
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { items: [], notes: "" };
    }

    // --- Normaliseren ---
    let items = Array.isArray(parsed.items) ? parsed.items : [];
    items = items
      .map(it => ({
        label: String(it.label || "").trim() || "Onbekend",
        grams: Number(it.grams),
      }))
      .filter(it => Number.isFinite(it.grams) && it.grams >= 0);

    const total = items.reduce((s, it) => s + it.grams, 0);

    // --- Gebruikersvriendelijke tekst maken (voor je grijze analysevak)
    const lines = [];
    lines.push("Hier is een schatting van het aantal koolhydraten per onderdeel:");
    items.forEach((it, idx) => {
      lines.push(`${idx + 1}. **${it.label}**: ongeveer ${it.grams} gram koolhydraten`);
    });
    lines.push("");
    lines.push("### Totaal:");
    items.forEach(it => lines.push(`- **${it.label}**: ${it.grams} g`));
    lines.push("");
    lines.push(`**Totaal koolhydraten**: **${total.toFixed(1)} g**`);
    if (parsed.notes) lines.push(`\n> ${String(parsed.notes).trim()}`);

    const humanText = lines.join("\n");

    // --- CORS toestaan voor frontend ---
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // --- JSON-resultaat naar frontend ---
    res.status(200).json({
      ok: true,
      items,
      total,
      text: humanText,
    });
  } catch (err) {
    console.error("Proxyfout:", err);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ error: err.message });
  }
};
