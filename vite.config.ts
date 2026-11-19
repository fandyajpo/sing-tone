import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { MAX_SNAPSHOT_BYTES, handleSnapshot } from "./deploy/snapshot.js";

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers?: Record<string, string>) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  for (const [name, value] of Object.entries(headers ?? {})) res.setHeader(name, value);
  res.end(JSON.stringify(body));
}

/**
 * Dev-only twin of the deployed endpoint. `DISCORD_WEBHOOK_URL` is read from the
 * server environment / `.env` and never exposed through `import.meta.env`.
 */
function snapshotEndpoint(webhookUrl: string | undefined): Plugin {
  return {
    name: "sing-tone-snapshot-endpoint",
    configureServer(server) {
      server.middlewares.use("/api/snapshot", (req: IncomingMessage, res: ServerResponse) => {
        const chunks: Uint8Array[] = [];
        let size = 0;
        let tooLarge = false;
        let finished = false;

        const finish = (status: number, body: unknown, headers?: Record<string, string>) => {
          if (finished) return;
          finished = true;
          sendJson(res, status, body, headers);
        };

        req.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_SNAPSHOT_BYTES) {
            tooLarge = true;
            return;
          }
          chunks.push(chunk);
        });
        req.on("error", () => {
          finish(400, { ok: false, status: "unreadable", message: "The snapshot body could not be read." });
        });
        req.on("end", () => {
          void (async () => {
            if (tooLarge) {
              finish(413, {
                ok: false,
                status: "too-large",
                message: "Snapshots must be 2 MB or smaller.",
              });
              return;
            }

            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
              bytes.set(chunk, offset);
              offset += chunk.length;
            }

            const host = headerValue(req.headers.host) || "127.0.0.1";
            const result = await handleSnapshot({
              method: req.method ?? "GET",
              origin: headerValue(req.headers.origin),
              requestUrl: `http://${host}${req.url ?? "/api/snapshot"}`,
              contentType: headerValue(req.headers["content-type"]),
              consent: headerValue(req.headers["x-snapshot-consent"]),
              clientKey: "local-dev",
              bytes,
              webhookUrl,
              now: Date.now(),
            });

            finish(result.code, result.body, result.headers);
          })();
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react(), tailwindcss(), snapshotEndpoint(env.DISCORD_WEBHOOK_URL)],
    server: {
      host: true,
      port: 5173,
    },
  };
});
