import test from "node:test";
import assert from "node:assert/strict";
import { extractResponseText } from "../lib/server.js";
import analysisHandler, { validateInput } from "../api/proxy.js";

const validImage = `data:image/jpeg;base64,${Buffer.from("test").toString("base64")}`;

test("validateInput accepteert de vaste scannerinvoer", () => {
  assert.equal(validateInput({ image: validImage, description: "een boterham" }), null);
});

test("validateInput weigert een willekeurig OpenAI-request", () => {
  assert.equal(validateInput({ model: "ander-model", messages: [] }), "Geen afbeelding ontvangen.");
});

test("validateInput weigert niet-ondersteunde data-URL's", () => {
  assert.match(validateInput({ image: "data:text/plain;base64,dGVzdA==" }), /JPEG/);
});

test("extractResponseText leest Responses API-uitvoer", () => {
  const data = {
    output: [{ content: [{ type: "output_text", text: '{"meal_detected":true}' }] }],
  };
  assert.equal(extractResponseText(data), '{"meal_detected":true}');
});

test("analysehandler bepaalt zelf endpoint, model en prompt", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key-not-secret";
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        id: "resp_test",
        output: [{ content: [{ type: "output_text", text: JSON.stringify({ meal_detected: false }) }] }],
      }),
    };
  };

  const req = {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.10" },
    socket: {},
    body: { image: validImage, description: "test" },
  };
  const result = { status: null, payload: null, headers: {} };
  const res = {
    setHeader(name, value) { result.headers[name] = value; },
    status(code) { result.status = code; return this; },
    json(payload) { result.payload = payload; return this; },
  };

  try {
    await analysisHandler(req, res);
    assert.equal(result.status, 200);
    assert.equal(captured.url, "https://api.openai.com/v1/responses");
    assert.equal(captured.body.model, "gpt-4o-mini");
    assert.equal(captured.body.input[0].content[1].type, "input_image");
    assert.equal("messages" in captured.body, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
