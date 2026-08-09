import {
  applyCors,
  checkRateLimit,
  clientIp,
  extractResponseText,
  isOriginAllowed,
  sendJson,
  setRateLimitHeaders,
} from "../lib/server.js";

const MAX_BODY_BYTES = 4_000_000;
const MAX_IMAGE_CHARACTERS = 3_700_000;
const MAX_DESCRIPTION_LENGTH = 800;
const REQUEST_TIMEOUT_MS = 45_000;

const MEAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "meal_detected",
    "items",
    "total",
    "summary",
    "assumptions",
  ],
  properties: {
    meal_detected: { type: "boolean" },
    items: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "portion",
          "carbs_min_g",
          "carbs_best_g",
          "carbs_max_g",
          "confidence",
          "reasoning",
        ],
        properties: {
          name: { type: "string", maxLength: 100 },
          portion: { type: "string", maxLength: 120 },
          carbs_min_g: { type: "number", minimum: 0, maximum: 500 },
          carbs_best_g: { type: "number", minimum: 0, maximum: 500 },
          carbs_max_g: { type: "number", minimum: 0, maximum: 500 },
          confidence: { type: "string", enum: ["laag", "middel", "hoog"] },
          reasoning: { type: "string", maxLength: 240 },
        },
      },
    },
    total: {
      type: "object",
      additionalProperties: false,
      required: ["carbs_min_g", "carbs_best_g", "carbs_max_g", "confidence"],
      properties: {
        carbs_min_g: { type: "number", minimum: 0, maximum: 1500 },
        carbs_best_g: { type: "number", minimum: 0, maximum: 1500 },
        carbs_max_g: { type: "number", minimum: 0, maximum: 1500 },
        confidence: { type: "string", enum: ["laag", "middel", "hoog"] },
      },
    },
    summary: { type: "string", maxLength: 400 },
    assumptions: {
      type: "array",
      maxItems: 8,
      items: { type: "string", maxLength: 200 },
    },
  },
};

const SYSTEM_PROMPT = `Je bent een voorzichtige voedingsassistent voor een educatieve koolhydratenscanner.
Analyseer uitsluitend de zichtbare maaltijd en eventuele toelichting van de gebruiker.
Schat porties conservatief, geef per onderdeel een minimum, beste schatting en maximum in gram koolhydraten.
Zorg dat minimum <= beste schatting <= maximum en dat het totaal logisch overeenkomt met de onderdelen.
Maak onzekerheid expliciet, vooral bij portiegrootte, saus, bereidingswijze en verborgen ingredienten.
Als er geen maaltijd zichtbaar is, zet meal_detected op false, gebruik lege items en nulwaarden.
Doe nooit uitspraken over insulinedosering.
Antwoord in helder Nederlands en volg exact het opgegeven JSON-schema.`;

function validateInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Ongeldige aanvraag.";
  }

  const { image, description = "" } = body;
  if (typeof image !== "string") return "Geen afbeelding ontvangen.";
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
    return "Alleen JPEG-, PNG- of WebP-afbeeldingen zijn toegestaan.";
  }
  if (image.length > MAX_IMAGE_CHARACTERS) return "De afbeelding is te groot.";
  if (typeof description !== "string") return "De beschrijving is ongeldig.";
  if (description.length > MAX_DESCRIPTION_LENGTH) return "De beschrijving is te lang.";
  return null;
}

function upstreamErrorStatus(status) {
  if (status === 429) return 429;
  if (status >= 400 && status < 500) return 400;
  return 502;
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(req)) return res.status(403).end();
    return res.status(204).end();
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "Gebruik POST." });
  if (!isOriginAllowed(req)) return sendJson(res, 403, { error: "Deze website is niet toegestaan." });
  if (!process.env.OPENAI_API_KEY) return sendJson(res, 503, { error: "De analyseservice is niet geconfigureerd." });

  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > MAX_BODY_BYTES) return sendJson(res, 413, { error: "De aanvraag is te groot." });
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    return sendJson(res, 415, { error: "Alleen JSON wordt ondersteund." });
  }

  const rate = checkRateLimit(`analysis:${clientIp(req)}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  setRateLimitHeaders(res, rate);
  if (!rate.allowed) return sendJson(res, 429, { error: "Te veel analyses. Probeer het over enkele minuten opnieuw." });

  const validationError = validateInput(req.body);
  if (validationError) return sendJson(res, 400, { error: validationError });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4o-mini",
        instructions: SYSTEM_PROMPT,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Beschrijving gebruiker: ${req.body.description.trim() || "geen aanvullende beschrijving"}`,
              },
              { type: "input_image", image_url: req.body.image, detail: "high" },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "meal_carbohydrate_analysis",
            strict: true,
            schema: MEAL_SCHEMA,
          },
        },
        max_output_tokens: 1400,
      }),
    });

    const data = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      console.error("OpenAI analysefout", { status: openaiResponse.status, requestId: data?.error?.request_id });
      return sendJson(res, upstreamErrorStatus(openaiResponse.status), {
        error: openaiResponse.status === 429
          ? "De analyseservice is tijdelijk druk. Probeer later opnieuw."
          : "De foto kon niet worden geanalyseerd.",
      });
    }

    const outputText = extractResponseText(data);
    let analysis;
    try {
      analysis = JSON.parse(outputText);
    } catch {
      console.error("Ongeldige gestructureerde uitvoer", { responseId: data?.id });
      return sendJson(res, 502, { error: "De analyseservice gaf een ongeldig resultaat." });
    }

    return sendJson(res, 200, { analysis, response_id: data.id || null });
  } catch (error) {
    if (error?.name === "AbortError") return sendJson(res, 504, { error: "De analyse duurde te lang. Probeer opnieuw." });
    console.error("Serverfout bij analyse", error);
    return sendJson(res, 500, { error: "Er ging iets mis tijdens de analyse." });
  } finally {
    clearTimeout(timeout);
  }
}

export { validateInput };
