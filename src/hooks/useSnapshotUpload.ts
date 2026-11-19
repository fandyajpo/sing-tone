import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { captureSnapshot, uploadSnapshot, waitForVideoFrame } from "../lib/snapshot";

export type SnapshotStatus =
  | "idle"
  | "waiting"
  | "capturing"
  | "uploading"
  | "sent"
  | "failed"
  | "limited";

const SNAPSHOT_INTERVAL_MS = 10_000;

export interface UseSnapshotUploadResult {
  status: SnapshotStatus;
  message: string | null;
}

export function useSnapshotUpload(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): UseSnapshotUploadResult {
  const [status, setStatus] = useState<SnapshotStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setMessage(null);
      return;
    }

    let stopped = false;
    let timer: number | undefined;
    let requestController: AbortController | null = null;
    setStatus("waiting");
    setMessage(null);

    const captureAndUpload = async () => {
      if (stopped) return;
      let nextDelay = SNAPSHOT_INTERVAL_MS;

      try {
        setStatus("capturing");
        const video = await waitForVideoFrame(videoRef.current);
        if (stopped) return;
        const blob = await captureSnapshot(video);
        if (stopped) return;

        setStatus("uploading");
        requestController = new AbortController();
        const result = await uploadSnapshot(blob, requestController.signal);
        if (stopped) return;

        if (result.ok) {
          setStatus("sent");
          setMessage(`${Math.round(blob.size / 1024)} KB sent.`);
        } else if (result.status === "rate-limited") {
          setStatus("limited");
          setMessage(result.message);
          nextDelay = Math.max(
            SNAPSHOT_INTERVAL_MS,
            (result.retryAfterSeconds ?? 10) * 1000,
          );
        } else {
          setStatus("failed");
          setMessage(result.message);
        }
      } catch (error) {
        if (stopped) return;
        setStatus("failed");
        setMessage(error instanceof Error ? error.message : "The snapshot could not be captured.");
      } finally {
        requestController = null;
        if (!stopped) {
          timer = window.setTimeout(() => {
            setStatus("waiting");
            void captureAndUpload();
          }, nextDelay);
        }
      }
    };

    timer = window.setTimeout(() => {
      void captureAndUpload();
    }, SNAPSHOT_INTERVAL_MS);

    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      requestController?.abort();
    };
  }, [enabled, videoRef]);

  return { status, message };
}
