# Sing Tone — Scalability & Performance Audit

Date: 2026-11-19
Scope: whole repository (frontend, MediaPipe pipeline, recognition, audio, static host Worker, snapshot endpoint, build and delivery).
Method: source inspection, build measurement, browser measurement of canvas primitives, and a CPU micro-benchmark of the recognition pipeline. No live camera session was available in the automation browser (native permission prompt), and no production load test was executed; both are listed as limitations at the end.

---

## 1. Architecture overview

```
video element ──(getUserMedia 1280×720@30)──┐
                                            │
rAF loop A (30 fps, adaptive) ── detectForVideo ── HandFrame ── frameRef (no React)
                                            │                       │
                                            │        ┌──────────────┴──────────────┐
                                            │        │ rAF loop B (60 fps)         │
                                            │        │  FingerClassifier.update    │
                                            │        │  movement / pitch state     │
                                            │        │  HandVisionRenderer.draw    │
                                            │        └──────┬──────────────┬───────┘
                                            │               │ setState     │ audio
                                            │               ▼              ▼
                                            │        React HUD (App)   Tone.js graph
                                            │
rAF loop C (60 fps) ── WaveformVisualizer ── Tone.Waveform
```

- Entry: `src/main.tsx` → `src/App.tsx` (single 655-line component owning all UI state).
- Tracking: `src/hooks/useHandTracking.ts` + `src/lib/mediapipe.ts` (Tasks-Vision, GPU delegate with CPU fallback).
- Recognition: `src/lib/finger-extension.ts` (geometry) + `src/lib/finger-classifier.ts` (temporal state machine) + `src/lib/hand-profile.ts` (per-hand learned proportions in localStorage).
- Interaction: `src/hooks/usePitchSynth.ts` (per-finger continuous voices) or `src/hooks/useGestureSynth.ts` (two-hand chords). Exactly one is enabled at a time.
- Audio: `src/lib/audio-engine.ts` (Tone.js bus: shelf → compressor → makeup → limiter) and `src/lib/pitch-voices.ts` (one `Tone.Synth` per finger).
- Hosting: static build in `dist/`, served by a Cloudflare Worker (`deploy/worker.js` → `env.ASSETS`), SPA fallback. Production: `https://sing-tone-4oi20o.freebuff.site`.
- Backend: one route, `POST /api/connection-checker` (`deploy/snapshot.js`), which validates, rate limits and forwards opted-in still frames to a Discord webhook. No database, no sessions, no user accounts.
- Dev parity: `vite.config.ts` mounts the same handler as middleware.

---

## 2. Measurements

### 2.1 Bundle composition (baseline build, 2026-11-19)

Isolated with a throwaway `manualChunks` build (not committed):

| Chunk | Raw | Notes |
|---|---|---|
| app code | 108 kB | App + components + recognition |
| react + scheduler | 222 kB | needed at first paint |
| `@mediapipe/tasks-vision` | 125 kB | **not needed at first paint** |
| tone + its deps | 241 kB | needed on first sound, not at paint |
| CSS | 31 kB (45.8 kB unminified Tailwind output) | |

Shipped baseline: **702.47 kB JS / 205.16 kB gzip** in one entry chunk.

### 2.2 Delivery headers (production, measured with curl)

| Asset | Cache-Control |
|---|---|
| `/` (HTML) | `public, max-age=0, must-revalidate` ✅ correct |
| `/assets/index-*.js` (content-hashed) | `public, max-age=0, must-revalidate` ❌ revalidated on every visit |
| `hand_landmarker.task` (Google CDN, 7.82 MB) | `public, max-age=3600` (no `immutable`) |
| jsDelivr wasm (33 MB set, ~11 MB used) | versioned + immutable ✅ |

### 2.3 Recognition CPU cost (Node micro-benchmark, `scripts/bench-finger.ts`)

| Operation | ms/op | ops/s |
|---|---|---|
| `analyzeHand` (geometry, 1 hand) | 0.0042–0.0057 | ~175k–240k |
| `FingerClassifier.update` (1 hand) | 0.0053–0.0065 | ~150k–190k |
| two hands per inference | **~0.011 ms** | — |

Geometry is 82–88% of classification. Both hands together consume ~0.03% of a 33 ms inference budget on this desktop; expect roughly 3–6× that on a low-end phone, still under 0.2%. **Classification is not the bottleneck** — it is I/O-bound by inference and by canvas painting.

### 2.4 Canvas primitives (measured in the packaged Chromium)

| Operation | Cost |
|---|---|
| `createRadialGradient` + 3 stops + fill | 4.7 µs |
| cached gradient + `translate` + fill | 1.0 µs (**4.7× faster**) |

The renderer created one radial gradient per fingertip per frame plus one linear gradient per moving trail — up to 10–12 gradient objects per frame, i.e. ~700/second at 60 fps.

---

## 3. Findings

Severity: **CRITICAL** immediate action · **HIGH** significant risk · **MEDIUM** recommended · **GREEN** healthy.

### HIGH

**H1 — Camera frames were uploaded without an explicit consent step.**
`src/App.tsx` `handleStart` was invoked by `StartGate` with `allowSnapshotUploads = true`, so every visitor who pressed "allow camera →" silently started `useSnapshotUpload`, which POSTs a still frame to `/api/connection-checker` every 10 s (up to 12/day). The disclosure UI in `App.tsx` and the consent checkbox were commented out, and the start button copy mentions only "camera + sound". Violates the stated requirement that frames leave the browser only with explicit consent.
*Impact:* privacy exposure and a per-user backend request stream that is invisible to the user. *Fixed:* see §5.

**H2 — The snapshot forwarder had no upstream timeout.**
`deploy/snapshot.js` `forwardSnapshot` awaited `fetch(webhookUrl)` with no `AbortSignal`. A slow or hanging Discord webhook holds the Worker request (and billable wall time) until the platform limit, and there is no retry-after signal to the client.
*Fixed:* 8 s `AbortSignal.timeout`.

**H3 — Rate limiting is per isolate, not global.**
`deploy/snapshot.js` keeps `buckets` in module memory. Cloudflare Workers run many isolates per colo and many colos; a client can therefore exceed the 1-per-10 s and 12-per-day limits by hitting different isolates, and each isolate's `MAX_TRACKED_CLIENTS = 2000` map is lost on eviction. With one shared Discord webhook (Discord allows roughly 5 requests / 2 s per webhook), a few hundred opted-in users can saturate the webhook for everyone.
*Recommendation:* keep the local limiter as a cheap first line, and add edge rate limiting (Cloudflare WAF rate-limiting rule on `/api/connection-checker`) or a Durable Object counter if the feature ships widely. Not implemented here: it requires infrastructure outside the repository, and the feature is now off by default.

**H4 — MediaPipe inference runs synchronously on the main thread.**
`useHandTracking.ts` calls `landmarker.detectForVideo(video, ts)` inside a rAF callback. WebAssembly + GPU readback for up to 2 hands at 30 fps is the single largest recurring cost (order of 10–30 ms per call on mid-range hardware), and it shares the thread with React, canvas painting and audio scheduling. It is the direct cause of frame drops and input latency on low-end devices.
*Mitigations applied* (no rewrite): adaptive inference cadence, idle backoff, hidden-tab suppression, lower capture resolution on weak devices (§5). *Recommended next:* move detection into a dedicated Worker (`OffscreenCanvas`/`ImageBitmap` input, transferable `Float32Array` landmarks back). This is a structural change with real accuracy/regression risk and was deliberately not attempted in this pass.

### MEDIUM

**M1 — 125 kB of tracking SDK was in the entry bundle.**
`src/lib/mediapipe.ts` statically imported `@mediapipe/tasks-vision`, so the start screen could not render until it parsed, even though nothing touches it until a session starts. *Fixed:* dynamic import (−123.9 kB raw / −37.8 kB gzip from the entry chunk; the SDK is now a 125.42 kB / 38.12 kB gzip chunk fetched on demand).

**M2 — Content-hashed assets were not cached.**
The host defaults every asset to `max-age=0, must-revalidate`, so returning visitors revalidate the whole bundle. *Fixed:* the Worker now sets `public, max-age=31536000, immutable` for `/assets/*` and a one-week stale-while-revalidate policy for `/models/*` and `/mediapipe/*`, while the HTML shell keeps revalidating so deploys are picked up immediately.

**M3 — Web fonts were loaded through a CSS `@import`.**
`src/index.css` line 1 imported the Google Fonts stylesheet. `@import` inside the main CSS serialises the font request behind Tailwind's stylesheet parse and blocks text paint; there were no `preconnect` hints for `fonts.gstatic.com`, jsDelivr or Google Storage. *Fixed:* the stylesheet is a `<link>` in `index.html` with preconnects for every origin the session will use.

**M4 — The pitch HUD republished at 22 Hz, re-rendering the whole App.**
`usePitchSynth.ts` published a snapshot every 45 ms through `setState` in `App`, so the entire UI tree (both rails, settings sheet contents, HUD) reconciled ~22 times per second. The classifier data itself is already outside React (refs), so only the readout needed this. *Fixed:* 100 ms (10 Hz), which is still faster than a musician can read a note label.

**M5 — The waveform strip animated at 60 fps forever, allocating gradients.**
`WaveformVisualizer.tsx` ran a rAF loop even before audio started, drawing three 260–320-point traces and creating two `linearGradient` objects every frame. *Fixed:* 30 fps, hidden-tab suppression, gradients cached per width.

**M6 — Per-fingertip gradient allocation in the hand renderer.**
`hand-renderer.ts` built a radial gradient per tip and a linear gradient per trail per frame (measured 4.7 µs vs 1.0 µs cached). *Fixed:* one cached gradient per tone drawn through `translate`, one cached trail gradient drawn through `translate`/`scale`, and particle update/draw skipped entirely when no particle is alive.

**M7 — One fixed camera profile for every device.**
`useCamera.ts` always requested 1280×720@30. On a phone that is decoded and then downscaled for inference, doubling memory bandwidth and inference cost for no recognition benefit (the recognizer is palm-relative). *Fixed:* phones and low-core/low-memory devices request 640×480@24; desktops keep 720p.

**M8 — Fixed inference rate regardless of measured cost.**
`useHandTracking.ts` used `TARGET_FPS = 30` unconditionally, so a device that needs 45 ms per frame built a permanent backlog (rAF fires, inference runs late, frames are skipped by `currentTime`). *Fixed:* cadence adapts from measured inference cost (30 → 24 → 20 fps) and drops to 20 fps when no hand has been seen for 1.5 s.

**M9 — Model is fetched from a third-party origin with a one-hour TTL.**
`hand_landmarker.task` is 7.82 MB from `storage.googleapis.com` with `max-age=3600`. Every returning user re-downloads it after an hour; it is also outside the app's own cache-control policy and subject to Google's availability.
*Recommendation:* self-host the model behind the same Worker (or an R2 bucket managed by the host) with `immutable` caching and a content hash in the filename. Not done here: the site has a 10 MiB asset budget and the model alone is 7.82 MB, so this needs a hosting decision, not a code change.

### LOW

**L1 — Duplicate classification at display rate.** Loop B recomputes classification on every display frame even though new landmarks arrive at 30 fps (and now as low as 20 fps). Measured cost is ~10 µs per duplicate — real but ~0.1% of a frame. Deliberately left alone: gating it would change the frame-count semantics of `openFrames`/`closeFrames` and therefore recognition timing, for no measurable gain.
**L2 — `Math.random`/object churn in particles.** Bounded pool (220), now skipped when idle.
**L3 — `getContext("2d")` per frame** in both interaction hooks: returns the cached context, negligible.
**L4 — Two `HandVisionRenderer` instances** (pitch and chord hooks) each hold a 220-particle pool; only one loop runs at a time. ~30 kB, irrelevant.
**L5 — `hand-profile` writes localStorage** every 25 observations, not every frame. Fine.

### GREEN

- **Audio graph.** Single `AudioContext` owned by Tone (shared), a shared master bus, `maxPolyphony = 48`, per-note reference counting in `AudioEngine.held`, voice pool capped at ten in `pitch-voices.ts`, `rampTo` automation for pitch/brightness/volume (no zipper noise), and explicit `dispose()` on engine teardown and instrument switch.
- **Camera lifecycle.** One `getUserMedia` call per start, previous stream stopped first, `track.onended` handled, `srcObject` cleared on unmount.
- **React/state separation.** Per-frame tracking data lives in `frameRef`; the classifier, renderer and movement analyzer are refs; only coarse readouts enter state.
- **Recognition cost.** ~5 µs per hand; geometry normalized by palm width, allocation-light and independent of camera resolution.
- **Backend surface.** Stateless, one POST route, magic-byte validation, 2 MB body cap, same-origin check, `content-type` check, 405/415/400/413/429/502 responses, no CORS wildcard, no secrets in the client bundle, no frame data stored.
- **Dependencies.** `npm audit`: 0 vulnerabilities (info/low/moderate/high/critical).
- **Worker/static hosting.** No server rendering, no database, no per-user compute on the request path.

---

## 4. Scalability model and infrastructure recommendations

The important scaling fact: **the music pipeline is entirely client-side**. A session costs the host **zero** requests and zero compute. 5,000 simultaneous performers are 5,000 CDN clients, which is a bandwidth question, not a concurrency question.

Per-1000 fully opted-in snapshot users:
- 1 upload / 10 s → 6/min/user → 6,000 req/min = 100 req/s at peak.
- Daily cap 12/day/user → 12,000 requests/day → ~360k/month, which exceeds the site's 100k monthly request allowance and Discord's per-webhook limits long before that.
- At 1000 concurrent *HTTP* users against the endpoint, the isolates forward at most a handful of images per second per webhook; the limiter (not CPU) becomes the ceiling.

Recommendations, in order of value:
1. Keep the app static and edge-served; do not add a database, session layer or API tier. There is nothing to scale horizontally.
2. Ship snapshots off by default (done) and treat the endpoint as an opt-in diagnostic feature.
3. Add edge rate limiting (Cloudflare rate-limiting rule or Durable Object counter) before enabling the feature broadly; per-isolate maps are not a security boundary.
4. Self-host the 7.82 MB model with immutable caching if bandwidth or third-party TTL becomes a cost problem.
5. If inference is ever offloaded, prefer a Worker with `ImageBitmap` transfer over a server-side vision service: keep frames on-device.

---

## 5. Changes implemented

| # | File | Change | Measured effect |
|---|---|---|---|
| 1 | `src/lib/mediapipe.ts` | `@mediapipe/tasks-vision` loaded with `await import()` inside `createHandLandmarker`; types stay type-only | entry JS **702.47 → 578.58 kB** raw, **205.16 → 167.33 kB** gzip; SDK deferred as `vision_bundle-*.js` 125.42 kB / 38.12 kB gzip |
| 2 | `deploy/worker.js` | `serveAsset()` sets `immutable` for `/assets/*` (200 responses only, 304 passes through), week-long SWR for `/models/*`, `/mediapipe/*` | returning visitors stop revalidating the bundle; no change to HTML revalidation |
| 3 | `index.html`, `src/index.css` | font stylesheet moved from CSS `@import` to `<link>`; preconnect to fonts.googleapis.com, fonts.gstatic.com, cdn.jsdelivr.net, storage.googleapis.com | font fetch no longer serialised behind the stylesheet; verified in the browser that gstatic font requests fire on load |
| 4 | `src/hooks/usePitchSynth.ts` | publish interval 45 → 100 ms | App re-renders from ~22/s to 10/s |
| 5 | `src/components/WaveformVisualizer/WaveformVisualizer.tsx` | 30 fps cap, hidden-tab skip, width-keyed gradient cache | gradient allocations 2/frame → 0; path work halved |
| 6 | `src/lib/hand-renderer.ts` | cached per-tone radial gradient + `translate`; one cached trail gradient + `translate`/`scale`; particle update/draw skipped when the pool is idle | gradient cost 4.7 → 1.0 µs each, ~10–12 allocations/frame removed |
| 7 | `src/hooks/useCamera.ts` | low-power devices (≤4 cores, ≤4 GB, coarse pointer) request 640×480@24; others 1280×720@30 | lower decode + inference cost on phones |
| 8 | `src/hooks/useHandTracking.ts` | adaptive inference cadence from measured cost (30/24/20 fps), 20 fps idle backoff, hidden-tab suppression | removes backlog on slow devices; no threshold or accuracy change |
| 9 | `deploy/snapshot.js` | `AbortSignal.timeout(8000)` on the webhook forward | bounded request wall time, frees the isolate |
| 10 | `src/lib/pitch-voices.ts` | hard cap of 10 live voices | prevents unbounded node growth if a key ever leaks |
| 11 | `src/App.tsx` | start no longer enables snapshot uploads | frames stay in the tab unless an explicit opt-in is restored |
| 12 | `scripts/bench-finger.ts` (new) | reproducible CPU benchmark for geometry + classifier | baseline and regression tracking |
| 13 | `scripts/load-test.js` (new) | k6 scenario for the snapshot endpoint (100/500/1000 VUs, p95/p99 thresholds) | runnable test harness, not yet executed (k6 not installed) |

Verification after the changes:
- `npx tsc --noEmit` → exit 0
- `VITE_MEDIAPIPE_CDN=1 npm run build` → exit 0, two chunks (578.58 kB entry, 125.42 kB vision bundle)
- `scripts/finger-check.ts` synthetic suite → **449/449 checks passed** (recognition behaviour unchanged)
- `scripts/bench-finger.ts` re-run 4× → same 0.0041–0.0057 ms/op band as baseline (the one slow run was noise, reproduced as fast on repeat)
- dev server: app renders, no console errors, fonts and module graph load correctly

---

## 6. Remaining bottlenecks and limitations

1. **Main-thread inference (H4) is still the dominant cost.** Adaptive cadence and a smaller capture reduce it; only a Worker/offscreen move removes it. That is the next structural step and needs a real-device profiling session first.
2. **No live-camera profile was captured.** The automation browser cannot grant camera permission, so tracking FPS, long tasks, frame drops and audio latency are unmeasured on device. The numbers in this report are static analysis, bundle measurement, isolated canvas primitives and CPU micro-benchmarks.
3. **No backend load test was executed.** `k6` is not installed and the production endpoint has no configured webhook, so a run would only measure the 503 path. `scripts/load-test.js` is ready for a preview deployment with a test webhook. The rate limiter would dominate any single-source run by design.
4. **Model caching (M9) and global rate limiting (H3)** need hosting decisions and are recommended, not implemented.
5. **Low-end device profiles** (low/mid/high) are implemented as heuristics (core count, memory, pointer type) rather than measured device profiles; they should be replaced with measured thresholds once real device data exists.
6. The React tree still re-renders on each 10 Hz publish. Isolating the HUD behind an external store would remove that, but 10 Hz reconciliations of a mostly static tree are not a measured problem and the refactor risk was not justified.

## 7. Recommended sequence (next)

1. Profile a real session on a mid-range Android phone (Chrome tracing: long tasks, inference duration, GPU memory) to confirm H4 and size M7/M8 thresholds.
2. Move detection into a Worker with `ImageBitmap` frames; keep the classifier, audio and rendering where they are.
3. Self-host the model with immutable caching (M9) once hosting budget allows.
4. Add edge rate limiting (H3) before any broad rollout of snapshots.
5. Wire `scripts/load-test.js` into a preview environment with a test webhook and record p50/p95/p99 per VU tier.
