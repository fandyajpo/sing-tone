import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from "@mediapipe/tasks-vision";
import type { HandFrame, HandSample, Handedness } from "../types/hand";

const base = import.meta.env.BASE_URL;

/**
 * Hosted builds keep the 40 MB tracking runtime off the deploy origin, so the
 * upload stays inside the host's asset budget. Development and offline builds
 * serve the copies in public/ that `npm run setup:assets` puts there.
 */
const CDN_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const CDN_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const useCdnForAssets = import.meta.env.VITE_MEDIAPIPE_CDN === "1";

export const MODEL_URL = useCdnForAssets ? CDN_MODEL_URL : `${base}models/hand_landmarker.task`;
export const WASM_URL = useCdnForAssets ? CDN_WASM_URL : `${base}mediapipe/wasm`;

export interface LandmarkerOptions {
  numHands: number;
  minHandDetectionConfidence: number;
  minHandPresenceConfidence: number;
  minTrackingConfidence: number;
}

export const DEFAULT_LANDMARKER_OPTIONS: LandmarkerOptions = {
  numHands: 2,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

/**
 * Loads the MediaPipe hand landmarker. Everything stays on the local machine:
 * the wasm runtime and the model are served from this app's own assets.
 */
export async function createHandLandmarker(
  options: Partial<LandmarkerOptions> = {},
): Promise<HandLandmarker> {
  const config: LandmarkerOptions = { ...DEFAULT_LANDMARKER_OPTIONS, ...options };
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);

  const build = (delegate: "GPU" | "CPU"): Promise<HandLandmarker> =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: config.numHands,
      minHandDetectionConfidence: config.minHandDetectionConfidence,
      minHandPresenceConfidence: config.minHandPresenceConfidence,
      minTrackingConfidence: config.minTrackingConfidence,
    });

  try {
    return await build("GPU");
  } catch {
    // GPU delegate is unavailable on plenty of machines; CPU still runs fine.
    return await build("CPU");
  }
}

function toHandedness(label: string): Handedness {
  return label.toLowerCase() === "left" ? "left" : "right";
}

/**
 * Converts a raw MediaPipe result into our frame shape. MediaPipe's handedness
 * labels assume a mirrored (selfie) input, and we mirror the preview too, so
 * the labels are swapped to match what the performer actually sees.
 */
export function toHandFrame(
  result: HandLandmarkerResult,
  timestamp: number,
  videoWidth: number,
  videoHeight: number,
): HandFrame {
  const hands: HandSample[] = [];

  for (let i = 0; i < result.landmarks.length; i += 1) {
    const landmarks = result.landmarks[i];
    if (!landmarks || landmarks.length < 21) continue;

    const category = result.handednesses[i]?.[0];
    const rawHandedness = toHandedness(category?.categoryName ?? "Right");
    hands.push({
      handedness: rawHandedness === "left" ? "right" : "left",
      score: category?.score ?? 0,
      landmarks: landmarks.map((landmark) => ({ x: landmark.x, y: landmark.y, z: landmark.z })),
    });
  }

  return { hands, timestamp, videoWidth, videoHeight };
}
