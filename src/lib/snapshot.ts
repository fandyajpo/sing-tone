const CONSENT_KEY = "sing-tone.snapshot-consent.v1";
const MAX_CAPTURE_WIDTH = 960;
const UPLOAD_TIMEOUT_MS = 20_000;

export type SnapshotUploadStatus =
  | "sent"
  | "rate-limited"
  | "rejected"
  | "unavailable"
  | "error";

export interface SnapshotUploadResult {
  ok: boolean;
  status: SnapshotUploadStatus;
  message: string;
  retryAfterSeconds?: number;
}

/** Off unless the visitor ticked the disclosure on the start screen. */
export function readSnapshotConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

export function storeSnapshotConsent(granted: boolean): void {
  try {
    if (granted) window.localStorage.setItem(CONSENT_KEY, "granted");
    else window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Storage can be blocked; the in-memory choice still applies this session.
  }
}

export async function waitForVideoFrame(
  video: HTMLVideoElement | null,
  timeoutMs = 3000,
): Promise<HTMLVideoElement> {
  if (!video) throw new Error("The camera is not attached yet.");
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return video;
    await new Promise((resolve) => window.setTimeout(resolve, 60));
  }
  throw new Error("The camera did not produce a frame in time.");
}

/** One downscaled JPEG from the live video, never a recording. */
export async function captureSnapshot(video: HTMLVideoElement): Promise<Blob> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error("The camera has not produced a frame yet.");

  const scale = Math.min(1, MAX_CAPTURE_WIDTH / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot prepare the snapshot.");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.82);
  });
  if (!blob) throw new Error("The snapshot could not be encoded.");
  return blob;
}

function parseBody(value: unknown): { status: string; message: string } {
  if (typeof value !== "object" || value === null) return { status: "", message: "" };
  const record = value as Record<string, unknown>;
  return {
    status: typeof record.status === "string" ? record.status : "",
    message: typeof record.message === "string" ? record.message : "",
  };
}

export async function uploadSnapshot(
  blob: Blob,
  signal?: AbortSignal,
): Promise<SnapshotUploadResult> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = window.setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch("/api/snapshot", {
      method: "POST",
      headers: {
        "content-type": blob.type || "image/jpeg",
        "x-snapshot-consent": "granted",
      },
      body: blob,
      signal: controller.signal,
      cache: "no-store",
    });

    const parsed = parseBody(await response.json().catch(() => null));

    if (response.ok && parsed.status === "sent") {
      return { ok: true, status: "sent", message: "Snapshot delivered." };
    }
    if (response.status === 429) {
      return {
        ok: false,
        status: "rate-limited",
        message: parsed.message || "Too many snapshots right now. Try again later.",
        retryAfterSeconds: Math.max(1, Number(response.headers.get("retry-after")) || 10),
      };
    }
    if (response.status === 503) {
      return {
        ok: false,
        status: "unavailable",
        message: "Snapshot upload is not configured on this server.",
      };
    }
    if (response.status === 400 || response.status === 403 || response.status === 413 || response.status === 415) {
      return {
        ok: false,
        status: "rejected",
        message: parsed.message || "The server rejected that snapshot.",
      };
    }
    return {
      ok: false,
      status: "error",
      message: parsed.message || "The snapshot could not be delivered.",
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, status: "error", message: "The snapshot upload timed out." };
    }
    return {
      ok: false,
      status: "error",
      message: "The snapshot could not be sent. Check your connection and retry.",
    };
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
