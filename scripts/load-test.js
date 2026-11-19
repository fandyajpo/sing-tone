/**
 * k6 load test for the only backend route in the app:
 * POST /api/connection-checker (consented snapshot hand-off).
 *
 * The route is the app's only write path, so it is the only one that can
 * saturate. Static assets are served by the CDN and do not hit the Worker.
 *
 * Run against a preview deployment, never production:
 *
 *   k6 run -e BASE_URL=https://<preview-host> -e VUS=100 scripts/load-test.js
 *
 * Note that the handler rate-limits each client to one upload per 10 seconds
 * and 12 per day, so a single-source run measures the rate-limited (429) path
 * on purpose: that is the abuse-protection behaviour under load. Point
 * -e CLIENT_KEY_HEADER=x-forwarded-for at a load balancer that assigns distinct
 * client addresses to measure the forwarding path instead.
 *
 * k6 virtual users are HTTP clients: they are NOT concurrent browser sessions
 * and say nothing about MediaPipe or audio performance.
 */
import http from "k6/http";
import { check } from "k6";
import { Counter, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:5173";
const VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || "1m";

// Smallest valid JPEG header k6 can send; the handler sniffs magic bytes.
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
]);

const accepted = new Counter("snapshot_accepted");
const limited = new Counter("snapshot_rate_limited");
const rejected = new Rate("snapshot_rejected");

export const options = {
  scenarios: {
    snapshots: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    // The endpoint must stay responsive under the requested concurrency.
    http_req_duration: ["p(95)<1500", "p(99)<3000"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  const response = http.post(`${BASE_URL}/api/connection-checker`, JPEG, {
    headers: {
      "content-type": "image/jpeg",
      "x-snapshot-consent": "granted",
      origin: BASE_URL,
    },
    tags: { route: "connection-checker" },
    timeout: "10s",
  });

  check(response, {
    "answered without a transport error": (r) => r.status > 0,
    "is a documented status": (r) => [200, 400, 403, 413, 415, 429, 502, 503].includes(r.status),
  });

  if (response.status === 200) accepted.add(1);
  else if (response.status === 429) limited.add(1);
  else rejected.add(1);
}

export function handleSummary(data) {
  const duration = data.metrics.http_req_duration?.values ?? {};
  const failed = data.metrics.http_req_failed?.values?.rate ?? 0;
  return {
    stdout: `\nVUs=${VUS} for ${DURATION}\n` +
      `rps=${(data.metrics.http_reqs?.values?.rate ?? 0).toFixed(1)} ` +
      `p50=${(duration.med ?? 0).toFixed(0)}ms p95=${(duration["p(95)"] ?? 0).toFixed(0)}ms ` +
      `p99=${(duration["p(99)"] ?? 0).toFixed(0)}ms error_rate=${(failed * 100).toFixed(2)}%\n`,
  };
}
