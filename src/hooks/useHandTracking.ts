import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandLandmarker, toHandFrame } from "../lib/mediapipe";
import type { LandmarkerOptions } from "../lib/mediapipe";
import type { HandFrame, TrackingStatus } from "../types/hand";
import { EMPTY_HAND_FRAME } from "../types/hand";

export interface TrackingStats {
  fps: number;
  hands: number;
}

export interface UseHandTrackingResult {
  status: TrackingStatus;
  error: string | null;
  stats: TrackingStats;
  /** Always points at the newest detection result; never triggers a re-render. */
  frameRef: RefObject<HandFrame>;
}

const TARGET_FPS = 30;

export function useHandTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  options: LandmarkerOptions,
): UseHandTrackingResult {
  const [status, setStatus] = useState<TrackingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TrackingStats>({ fps: 0, hands: 0 });

  const frameRef = useRef<HandFrame>({ ...EMPTY_HAND_FRAME });
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const lastHandsRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setError(null);
      frameRef.current = { ...EMPTY_HAND_FRAME };
      return;
    }

    let cancelled = false;
    let raf = 0;
    let landmarker: HandLandmarker | null = null;
    let lastVideoTime = -1;
    let lastTimestamp = 0;
    let lastInference = 0;
    let frames = 0;
    let windowStart = performance.now();
    let failures = 0;

    setStatus("loading");
    setError(null);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!landmarker || cancelled) return;

      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      if (video.currentTime === lastVideoTime) return;

      const now = performance.now();
      const minInterval = 1000 / TARGET_FPS;
      if (now - lastInference < minInterval) return;
      lastInference = now;
      lastVideoTime = video.currentTime;

      const timestamp = now <= lastTimestamp ? lastTimestamp + 1 : now;
      lastTimestamp = timestamp;

      try {
        const result = landmarker.detectForVideo(video, timestamp);
        frameRef.current = toHandFrame(result, timestamp, video.videoWidth, video.videoHeight);
        failures = 0;

        frames += 1;
        if (now - windowStart >= 800) {
          const fps = Math.round((frames * 1000) / (now - windowStart));
          const hands = frameRef.current.hands.length;
          if (hands !== lastHandsRef.current || Math.abs(fps - stats.fps) > 4) {
            lastHandsRef.current = hands;
            setStats({ fps, hands });
          }
          frames = 0;
          windowStart = now;
        }
      } catch {
        failures += 1;
        if (failures === 25) {
          setError("Hand tracking stopped responding. Try reloading the page.");
          setStatus("error");
        }
      }
    };

    createHandLandmarker(optionsRef.current)
      .then((created) => {
        if (cancelled) {
          created.close();
          return;
        }
        landmarker = created;
        landmarkerRef.current = created;
        setStatus("ready");
        raf = requestAnimationFrame(loop);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(
          err instanceof Error
            ? `Hand tracking failed to load: ${err.message}`
            : "Hand tracking failed to load.",
        );
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      frameRef.current = { ...EMPTY_HAND_FRAME };
      landmarkerRef.current = null;
      landmarker?.close();
      landmarker = null;
    };
    // `stats` is intentionally excluded: it is written here, never read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, videoRef]);

  // Live-update the confidence thresholds without rebuilding the landmarker.
  useEffect(() => {
    const landmarker = landmarkerRef.current;
    if (!landmarker || status !== "ready") return;
    try {
      landmarker.setOptions({
        numHands: options.numHands,
        minHandDetectionConfidence: options.minHandDetectionConfidence,
        minHandPresenceConfidence: options.minHandPresenceConfidence,
        minTrackingConfidence: options.minTrackingConfidence,
      });
    } catch {
      // Older builds may not support live option updates; defaults still work.
    }
  }, [
    status,
    options.numHands,
    options.minHandDetectionConfidence,
    options.minHandPresenceConfidence,
    options.minTrackingConfidence,
  ]);

  return { status, error, stats, frameRef };
}
