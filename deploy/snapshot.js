/**
 * Camera-snapshot endpoint.
 *
 * Shared by the deployed Worker and the Vite dev server so validation, rate
 * limiting and the Discord hand-off behave identically in both places.
 *
 * The webhook URL is read from the server environment only; it is never
 * returned in a response and never reaches the browser.
 */

export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

const CONSENT_VALUE = "granted";
const WINDOW_MS = 10 * 1000;
const WINDOW_MAX = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_MAX = 12;
const MAX_TRACKED_CLIENTS = 2000;

/** clientKey -> { dayStart, day, recent } */
const buckets = new Map();

/**
 * Recognises the only two formats we accept, by magic bytes rather than by the
 * client-supplied content type.
 */
export function sniffImageType(bytes) {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  return null;
}

/** Only Discord's own webhook hosts are acceptable, so the secret cannot be
 * pointed at an arbitrary URL. */
export function isAllowedWebhook(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    const allowedHost =
      host === "discord.com" ||
      host === "discordapp.com" ||
      host === "ptb.discord.com" ||
      host === "canary.discord.com";
    return (
      allowedHost && /^\/api\/webhooks\/\d+\/[\w-]+$/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function pruneBuckets(now) {
  if (buckets.size <= MAX_TRACKED_CLIENTS) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.dayStart > DAY_MS) buckets.delete(key);
  }
  // Still full of live clients: drop the oldest entries.
  let excess = buckets.size - MAX_TRACKED_CLIENTS;
  for (const key of buckets.keys()) {
    if (excess <= 0) break;
    buckets.delete(key);
    excess -= 1;
  }
}

/**
 * Sliding-window limit per client plus a daily ceiling. State is per isolate,
 * which is enough to stop a runaway client or a casual script.
 */
export function checkRateLimit(clientKey, now) {
  let bucket = buckets.get(clientKey);
  if (!bucket || now - bucket.dayStart > DAY_MS) {
    bucket = { dayStart: now, day: 0, recent: [] };
    buckets.set(clientKey, bucket);
  }

  bucket.recent = bucket.recent.filter((stamp) => now - stamp < WINDOW_MS);

  if (bucket.day >= DAY_MAX) {
    return {
      allowed: false,
      retryAfterMs: Math.max(1000, DAY_MS - (now - bucket.dayStart)),
    };
  }
  if (bucket.recent.length >= WINDOW_MAX) {
    const oldest = bucket.recent[0] ?? now;
    return {
      allowed: false,
      retryAfterMs: Math.max(1000, WINDOW_MS - (now - oldest)),
    };
  }

  bucket.recent.push(now);
  bucket.day += 1;
  pruneBuckets(now);
  return { allowed: true, retryAfterMs: 0 };
}

export async function forwardSnapshot(webhookUrl, bytes, mime, now) {
  const extension = mime === "image/png" ? "png" : "jpg";
  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      content: "Sing Tone · camera snapshot (user opted in)",
      allowed_mentions: { parse: [] },
      embeds: [
        {
          image: { url: `attachment://snapshot.${extension}` },
          timestamp: new Date(now).toISOString(),
          footer: { text: "10-second interval · user opted in" },
        },
      ],
    }),
  );
  form.append(
    "files[0]",
    new Blob([bytes], { type: mime }),
    `snapshot.${extension}`,
  );

  // An upstream that never answers would hold the request open until the
  // platform timeout; a bounded call keeps the isolate free.
  const response = await fetch(webhookUrl, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(8000),
  });
  return response.ok;
}

function reply(status, code, message, headers) {
  return { status, code, body: { ok: code === 200, status, message }, headers };
}

/**
 * Pure-ish request handler: validates, rate limits and forwards. Returns a
 * plain result so the caller decides how to build the HTTP response.
 */
export async function handleSnapshot({
  method,
  origin,
  requestUrl,
  contentType,
  consent,
  clientKey,
  bytes,
  webhookUrl,
  now,
}) {
  if (method !== "POST") {
    return reply("method-not-allowed", 405, "Use POST.", { Allow: "POST" });
  }

  let sameOrigin = true;
  try {
    sameOrigin = !origin || origin === new URL(requestUrl).origin;
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) {
    return reply(
      "forbidden",
      403,
      "Snapshots are accepted from the app's own origin only.",
    );
  }

  // A marker, not authentication: it keeps accidental calls and stray scripts
  // out of the channel. Real protection is the consent UI plus rate limiting.
  if (consent !== CONSENT_VALUE) {
    return reply(
      "consent-required",
      400,
      "This endpoint accepts consented snapshots only.",
    );
  }

  if (!contentType.toLowerCase().startsWith("image/")) {
    return reply("invalid-type", 415, "Send a JPEG or PNG image body.");
  }

  if (bytes.length === 0) {
    return reply("empty", 400, "The snapshot was empty.");
  }

  if (bytes.length > MAX_SNAPSHOT_BYTES) {
    return reply("too-large", 413, "Snapshots must be 2 MB or smaller.");
  }

  const mime = sniffImageType(bytes);
  if (!mime) {
    return reply("invalid-image", 415, "That file is not a valid JPEG or PNG.");
  }

  if (!webhookUrl) {
    return reply(
      "unconfigured",
      503,
      "The snapshot destination is not configured.",
    );
  }

  if (!isAllowedWebhook(webhookUrl)) {
    return reply(
      "misconfigured",
      503,
      "The snapshot destination is not a valid Discord webhook.",
    );
  }

  const limit = checkRateLimit(clientKey || "unknown", now);
  if (!limit.allowed) {
    const seconds = Math.ceil(limit.retryAfterMs / 1000);
    return reply(
      "rate-limited",
      429,
      `Too many snapshots. Try again in ${seconds} seconds.`,
      {
        "Retry-After": String(seconds),
      },
    );
  }

  let delivered = false;
  try {
    delivered = await forwardSnapshot(webhookUrl, bytes, mime, now);
  } catch {
    delivered = false;
  }

  if (!delivered) {
    return reply(
      "upstream-error",
      502,
      "The snapshot could not be delivered. Try again later.",
    );
  }

  return reply("OK", 200, "health");
}
