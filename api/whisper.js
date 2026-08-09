import Busboy from "busboy";
import {
  applyCors,
  checkRateLimit,
  clientIp,
  isOriginAllowed,
  sendJson,
  setRateLimitHeaders,
} from "../lib/server.js";

export const config = { api: { bodyParser: false } };

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 40_000;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/x-m4a",
]);

const EXTENSIONS = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/x-m4a": "m4a",
};

function readAudio(req) {
  return new Promise((resolve, reject) => {
    let audio = null;
    let fileTooLarge = false;
    const busboy = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: MAX_AUDIO_BYTES, fields: 0 },
    });

    busboy.on("file", (fieldName, file, info) => {
      if (fieldName !== "audio" || !ALLOWED_AUDIO_TYPES.has(info.mimeType)) {
        file.resume();
        return;
      }

      const chunks = [];
      file.on("limit", () => { fileTooLarge = true; });
      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", () => {
        if (!fileTooLarge) audio = { buffer: Buffer.concat(chunks), mimeType: info.mimeType };
      });
    });
    busboy.on("finish", () => {
      if (fileTooLarge) return reject(Object.assign(new Error("Audio te groot"), { code: "LIMIT" }));
      resolve(audio);
    });
    busboy.on("error", reject);
    req.pipe(busboy);
  });
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(req)) return res.status(403).end();
    return res.status(204).end();
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "Gebruik POST." });
  if (!isOriginAllowed(req)) return sendJson(res, 403, { error: "Deze website is niet toegestaan." });
  if (!process.env.OPENAI_API_KEY) return sendJson(res, 503, { error: "De transcriptieservice is niet geconfigureerd." });

  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("multipart/form-data")) {
    return sendJson(res, 415, { error: "Een audio-opname is vereist." });
  }
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > MAX_AUDIO_BYTES + 100_000) return sendJson(res, 413, { error: "De opname is te groot." });

  const rate = checkRateLimit(`transcription:${clientIp(req)}`, { limit: 15, windowMs: 10 * 60 * 1000 });
  setRateLimitHeaders(res, rate);
  if (!rate.allowed) return sendJson(res, 429, { error: "Te veel opnames. Probeer het over enkele minuten opnieuw." });

  let audio;
  try {
    audio = await readAudio(req);
  } catch (error) {
    if (error?.code === "LIMIT") return sendJson(res, 413, { error: "De opname is te groot." });
    console.error("Fout bij lezen audio", error);
    return sendJson(res, 400, { error: "De opname kon niet worden gelezen." });
  }
  if (!audio?.buffer?.length) return sendJson(res, 400, { error: "Geen geldige audio-opname ontvangen." });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const formData = new FormData();
    const extension = EXTENSIONS[audio.mimeType] || "webm";
    formData.append("file", new Blob([audio.buffer], { type: audio.mimeType }), `opname.${extension}`);
    formData.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe");
    formData.append("language", "nl");
    formData.append("prompt", "Koolhydraten, portiegrootte, ingredienten en maaltijdbeschrijving in het Nederlands.");

    const openaiResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData,
    });
    const data = await openaiResponse.json().catch(() => ({}));

    if (!openaiResponse.ok) {
      console.error("OpenAI transcriptiefout", { status: openaiResponse.status });
      return sendJson(res, openaiResponse.status === 429 ? 429 : 502, {
        error: openaiResponse.status === 429
          ? "De transcriptieservice is tijdelijk druk."
          : "De opname kon niet worden getranscribeerd.",
      });
    }

    return sendJson(res, 200, { text: String(data.text || "").trim() });
  } catch (error) {
    if (error?.name === "AbortError") return sendJson(res, 504, { error: "De transcriptie duurde te lang." });
    console.error("Serverfout bij transcriptie", error);
    return sendJson(res, 500, { error: "Er ging iets mis tijdens de transcriptie." });
  } finally {
    clearTimeout(timeout);
  }
}
