export const config = { runtime: "edge" };

export default async function handler(req) {
  // Sta zowel je GitHub Pages als je Vercel domein toe
  const allowedOrigins = [
    "https://fredje4711.github.io",
    "https://carbo-app.vercel.app",
  ];
  const origin = req.headers.get("origin") || "";
  const allow = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const send = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allow,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });

  // Preflight
  if (req.method === "OPTIONS") return send({ ok: true });

  if (req.method !== "POST") {
    return send({ ok: false, error: "Alleen POST is toegestaan" }, 405);
  }

  try {
    // ✅ Belangrijk: body ophalen als JSON (niet .text(), niet .formData())
    const body = await req.json(); // { model, messages }

    // Mini sanity-check
    if (!body?.messages || !Array.isArray(body.messages)) {
      return send({ ok: false, error: "Ongeldige payload: 'messages' ontbreekt" }, 400);
    }

    // Call naar OpenAI
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: body.model || "gpt-4o-mini",
        messages: body.messages,
        temperature: 0.5,
      }),
    });

    const raw = await resp.text(); // we lezen eerst als text om evt. fouten te loggen

    if (!resp.ok) {
      // Doorzetten wat OpenAI teruggaf helpt bij debuggen van 500’s
      return send(
        { ok: false, error: `OpenAI API-fout: ${resp.status}`, raw: raw.slice(0, 500) },
        500
      );
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return send({ ok: false, error: "Kon OpenAI-antwoord niet parsen", raw: raw.slice(0, 500) }, 500);
    }

    const message = data?.choices?.[0]?.message?.content;
    if (!message) {
      return send({ ok: false, error: "Geen geldige message in OpenAI-antwoord", data }, 500);
    }

    return send({ ok: true, message });
  } catch (err) {
    return send({ ok: false, error: err.message }, 500);
  }
}
