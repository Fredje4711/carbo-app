import { createHmac } from 'node:crypto';
import { checkRateLimit, clientIp, sendJson, setRateLimitHeaders } from './server.js';

// Atomic fixed windows across all Vercel instances when Redis is configured.
const SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if count > tonumber(ARGV[2]) then return {0, 0, ttl} end
local daily = redis.call('INCR', KEYS[2])
if daily == 1 then redis.call('PEXPIRE', KEYS[2], 86400000) end
if daily > tonumber(ARGV[3]) then return {0, 0, redis.call('PTTL', KEYS[2])} end
return {1, tonumber(ARGV[2]) - count, ttl}
`;

export async function rateLimit(scope, ip, options, env = process.env, request = fetch) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url && !token) return checkRateLimit(`${scope}:${ip}`, options);
  if (!url || !token || !url.startsWith('https://')) throw new Error('Rate limit configuration incomplete');
  const daily = Number(env[`${scope.toUpperCase()}_DAILY_LIMIT`] || 1000);
  if (!Number.isSafeInteger(daily) || daily < 1) throw new Error('Invalid daily limit');
  // Do not store the raw IP address in the remote limiter.
  const identity = createHmac('sha256', token).update(ip).digest('hex');
  const response = await request(url, {
    method: 'POST', signal: AbortSignal.timeout(4000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['EVAL', SCRIPT, '2', `carbo:${scope}:${identity}`, `carbo:${scope}:daily`, String(options.windowMs), String(options.limit), String(daily)]),
  });
  if (!response.ok) throw new Error('Rate limit unavailable');
  const { result, error } = await response.json();
  if (error || !Array.isArray(result) || result.length !== 3 || !result.every(Number.isFinite) || ![0, 1].includes(result[0]) || result[2] < 0) throw new Error('Invalid rate limit response');
  return { allowed: result[0] === 1, remaining: result[1], resetAt: Date.now() + result[2] };
}

export async function allowRequest(req, res, scope, options) {
  try {
    const rate = await rateLimit(scope, clientIp(req), options);
    setRateLimitHeaders(res, rate);
    if (rate.allowed) return true;
    sendJson(res, 429, { error: 'De gebruikslimiet is tijdelijk bereikt. Probeer later opnieuw.' });
  } catch {
    // A configured limiter outage must not turn into unlimited paid upstream calls.
    sendJson(res, 503, { error: 'De service is tijdelijk niet beschikbaar. Probeer later opnieuw.' });
  }
  return false;
}
