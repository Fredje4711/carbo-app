import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import handler from '../api/whisper.js';

test('audio-upload wordt gevalideerd en als Nederlandse transcriptie verstuurd', async () => {
  const oldKey = process.env.OPENAI_API_KEY; const oldFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  try {
    const boundary = 'carbo-test-boundary';
    for (const [type, expected] of [['audio/webm', 200], ['text/plain', 400]]) {
      const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="opname.webm"\r\nContent-Type: ${type}\r\n\r\naudio-test\r\n--${boundary}--\r\n`);
      const req = Readable.from([body]); req.method = 'POST'; req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length), 'x-forwarded-for': '192.0.2.80' };
      let calls = 0;
      globalThis.fetch = async (url, options) => {
        calls++; assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions'); assert.equal(options.body.get('language'), 'nl');
        return { ok: true, json: async () => ({ text: '200 gram pasta' }) };
      };
      const result = {};
      const res = { setHeader() {}, status(code) { result.code = code; return this; }, json(value) { result.value = value; } };
      await handler(req, res); assert.equal(result.code, expected); assert.equal(calls, expected === 200 ? 1 : 0);
      if (expected === 200) assert.equal(result.value.text, '200 gram pasta');
    }
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});
