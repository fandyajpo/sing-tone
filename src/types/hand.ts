export type Handedness = "left" | "right";

export type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";

/** Stable identifier for one fingertip on one hand. */
export type FingerKey = `${Handedness}:${FingerName}`;

export interface Landmark {
  /** Normalized horizontal position in the raw (unmirrored) video frame, 0..1. */
  x: number;
  /** Normalized vertical position in the video frame, 0..1. */
  y: number;
  z: number;
}

export interface HandSample {
  handedness: Handedness;
  score: number;
  /** All 21 MediaPipe hand landmarks, in the raw video coordinate space. */
  landmarks: Landmark[];
}

export interface HandFrame {
  hands: HandSample[];
  /** performance.now() timestamp of the detection that produced this frame. */
  timestamp: number;
  videoWidth: number;
  videoHeight: number;
}

export interface FingertipSample {
  key: FingerKey;
  hand: Handedness;
  finger: FingerName;
  /** Mirrored, display-space position across the visible video content (0..1). */
  x: number;
  y: number;
  z: number;
}

export const FINGER_NAMES: readonly FingerName[] = ["thumb", "index", "middle", "ring", "pinky"];

export const FINGER_LANDMARK: Record<FingerName, number> = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
};

/** Landmark indices that define a fingertip's full chain, used for the skeleton. */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

export type TrackingStatus = "idle" | "loading" | "ready" | "error";

export const EMPTY_HAND_FRAME: HandFrame = {
  hands: [],
  timestamp: 0,
  videoWidth: 1280,
  videoHeight: 720,
};
