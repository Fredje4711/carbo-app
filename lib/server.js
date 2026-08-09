const DEFAULT_ALLOWED_ORIGINS = [
  "https://carbo-app.vercel.app",
  "https://fredje4711.github.io",
];

const VERCEL_TEAM_SUFFIX = "-fredje4711-gmailcoms-projects.vercel.app";

const buckets = new Map();

export function allowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

export function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowed = allowedOrigins();

  if (origin && (allowed.has(origin) || isTrustedVercelPreview(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export function isOriginAllowed(req) {
  const origin = req.headers.origin;
  return !origin || allowedOrigins().has(origin) || isTrustedVercelPreview(origin);
}

export function isTrustedVercelPreview(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === "https:"
      && url.hostname.startsWith("carbo-")
      && url.hostname.endsWith(VERCEL_TEAM_SUFFIX);
  } catch {
    return false;
  }
}

export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export function checkRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  if (buckets.size > 1000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { allowed: true, remaining: limit - 1, resetAt: next.resetAt };
  }

  current.count += 1;
  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

export function setRateLimitHeaders(res, result) {
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
}

export function sendJson(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(payload);
}

export function extractResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;

  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}
