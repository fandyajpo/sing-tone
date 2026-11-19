import { MAX_SNAPSHOT_BYTES, handleSnapshot } from "./snapshot.js";

/**
 * Static host entry. `/api/connection-checker` forwards consented camera frames to the
 * Discord webhook held in `env.DISCORD_WEBHOOK_URL`; everything else is served
 * from the asset binding (which applies the SPA fallback).
 */
function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/connection-checker") {
      return env.ASSETS.fetch(request);
    }

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_SNAPSHOT_BYTES) {
      return json(413, { ok: false, status: "too-large", message: "Snapshots must be 2 MB or smaller." });
    }

    let bytes;
    try {
      bytes = new Uint8Array(await request.arrayBuffer());
    } catch {
      return json(400, { ok: false, status: "unreadable", message: "The snapshot body could not be read." });
    }

    const result = await handleSnapshot({
      method: request.method,
      origin: request.headers.get("origin") ?? "",
      requestUrl: request.url,
      contentType: request.headers.get("content-type") ?? "",
      consent: request.headers.get("x-snapshot-consent") ?? "",
      clientKey: request.headers.get("cf-connecting-ip") ?? "unknown",
      bytes,
      webhookUrl: env.DISCORD_WEBHOOK_URL,
      now: Date.now(),
    });

    return json(result.code, result.body, result.headers);
  },
};
