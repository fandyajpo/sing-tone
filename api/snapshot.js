import { MAX_SNAPSHOT_BYTES, handleSnapshot } from "../deploy/snapshot.js";

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
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST") {
      return json(405, { ok: false, status: "method-not-allowed", message: "Use POST." }, {
        Allow: "POST",
      });
    }

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_SNAPSHOT_BYTES) {
      return json(413, {
        ok: false,
        status: "too-large",
        message: "Snapshots must be 2 MB or smaller.",
      });
    }

    let bytes;
    try {
      bytes = new Uint8Array(await request.arrayBuffer());
    } catch {
      return json(400, {
        ok: false,
        status: "unreadable",
        message: "The snapshot body could not be read.",
      });
    }

    if (bytes.length > MAX_SNAPSHOT_BYTES) {
      return json(413, {
        ok: false,
        status: "too-large",
        message: "Snapshots must be 2 MB or smaller.",
      });
    }

    const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
    const clientKey = forwardedFor.split(",")[0]?.trim() || "unknown";
    const result = await handleSnapshot({
      method: request.method,
      origin: request.headers.get("origin") ?? "",
      requestUrl: url.href,
      contentType: request.headers.get("content-type") ?? "",
      consent: request.headers.get("x-snapshot-consent") ?? "",
      clientKey,
      bytes,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      now: Date.now(),
    });

    return json(result.code, result.body, result.headers);
  },
};
