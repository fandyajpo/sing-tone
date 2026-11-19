import type { FingerName } from "../types/hand";

/**
 * Every threshold the finger recognizer uses lives here. Nothing in the
 * geometry or temporal code carries a magic number, so the whole system can be
 * retuned (or calibrated per performer) from one place.
 */
export interface FingerTuning {
  /** Smoothed score needed before a finger may become OPEN. */
  enter: number;
  /** Score at or below which a finger is CLOSED. Between try/exit is partial. */
  exit: number;
  /** Consecutive qualified frames before activation. */
  openFrames: number;
  /** Consecutive closing frames before an OPEN finger releases. */
  closeFrames: number;
  /** Confidence floor for activation. */
  minConfidence: number;
  weights: {
    straightness: number;
    joints: number;
    alignment: number;
    reach: number;
  };
  straightness: readonly [number, number];
  angles: {
    mcp: readonly [number, number];
    pip: readonly [number, number];
    dip: readonly [number, number];
  };
  /** Knuckle-to-tip direction against the palm axis. */
  alignment: readonly [number, number];
  /** Measured extension against the finger's own expected length. */
  reach: readonly [number, number];
  /** Fully extended tip-to-knuckle distance, relative to palm width. */
  expectedLength: number;
}

export interface ThumbTuning {
  enter: number;
  exit: number;
  openFrames: number;
  closeFrames: number;
  minConfidence: number;
  weights: {
    straightness: number;
    joints: number;
    spread: number;
    outward: number;
    reach: number;
  };
  straightness: readonly [number, number];
  angles: {
    mcp: readonly [number, number];
    ip: readonly [number, number];
  };
  /** Tip distance from the index knuckle, in palm widths. */
  spread: readonly [number, number];
  /** How far the tip points away from the palm centre, in palm widths. */
  outward: readonly [number, number];
  reach: readonly [number, number];
}

export interface RecognitionConfig {
  /** EWMA factor for the per-finger geometry score. */
  smoothing: number;
  /** Frames of per-finger history kept for consistency scoring. */
  historyLength: number;
  visibility: {
    /** Landmarks within this normalized margin of the frame edge are suspect. */
    edge: number;
    /** MediaPipe hand score below which the whole hand is ignored. */
    minHandScore: number;
  };
  motion: {
    /** One-frame displacement (palm widths) that counts as a landmark jump. */
    jumpPalmPerFrame: number;
    /** Wrist-relative speed (palm widths per second) that counts as a jump. */
    jumpSpeed: number;
    /** Jitter (palm widths per frame) where stability starts to suffer. */
    jitterPalm: number;
    /** How long a jump keeps a finger UNSTABLE. */
    unstableHoldMs: number;
  };
  occlusion: {
    /** Two fingertips closer than this (palm widths) may be stacked. */
    proximity: number;
    /** Depth difference (palm widths) that decides which one is hidden. */
    depthGap: number;
  };
  confidence: {
    margin: number;
    consistency: number;
    stability: number;
    min: number;
  };
  timing: {
    /** A finger stays OCCLUDED this long after it was last seen. */
    occludedMs: number;
    /** Multiplier on `exit`: below it a closing finger releases immediately. */
    slam: number;
    /** Minimum quiet time between automatic profile observations. */
    calibrationIntervalMs: number;
  };
  fingers: Record<Exclude<FingerName, "thumb">, FingerTuning>;
  thumb: ThumbTuning;
}

export const FINGER_RECOGNITION: RecognitionConfig = {
  smoothing: 0.34,
  historyLength: 16,
  visibility: { edge: 0.008, minHandScore: 0.35 },
  motion: {
    jumpPalmPerFrame: 0.45,
    jumpSpeed: 16,
    jitterPalm: 0.018,
    unstableHoldMs: 120,
  },
  occlusion: {
    proximity: 0.16,
    depthGap: 0.015,
  },
  confidence: {
    margin: 0.45,
    consistency: 0.3,
    stability: 0.25,
    min: 0.5,
  },
  timing: {
    occludedMs: 320,
    slam: 0.55,
    calibrationIntervalMs: 900,
  },
  fingers: {
    index: {
      enter: 0.62,
      exit: 0.34,
      openFrames: 4,
      closeFrames: 2,
      minConfidence: 0.5,
      weights: { straightness: 0.34, joints: 0.34, alignment: 0.16, reach: 0.16 },
      straightness: [0.82, 0.955],
      angles: { mcp: [2.05, 2.9], pip: [2.2, 3.0], dip: [2.0, 2.9] },
      alignment: [0.12, 0.62],
      reach: [0.6, 0.88],
      expectedLength: 0.95,
    },
    middle: {
      enter: 0.62,
      exit: 0.34,
      openFrames: 4,
      closeFrames: 2,
      minConfidence: 0.5,
      weights: { straightness: 0.36, joints: 0.34, alignment: 0.15, reach: 0.15 },
      straightness: [0.84, 0.96],
      angles: { mcp: [2.1, 2.92], pip: [2.25, 3.0], dip: [2.05, 2.92] },
      alignment: [0.14, 0.64],
      reach: [0.62, 0.9],
      expectedLength: 1.04,
    },
    ring: {
      enter: 0.6,
      exit: 0.33,
      openFrames: 4,
      closeFrames: 2,
      minConfidence: 0.5,
      weights: { straightness: 0.34, joints: 0.34, alignment: 0.16, reach: 0.16 },
      straightness: [0.79, 0.94],
      angles: { mcp: [2.0, 2.88], pip: [2.15, 2.96], dip: [1.95, 2.88] },
      alignment: [0.08, 0.58],
      reach: [0.58, 0.86],
      expectedLength: 0.96,
    },
    pinky: {
      enter: 0.58,
      exit: 0.32,
      openFrames: 4,
      closeFrames: 2,
      minConfidence: 0.48,
      weights: { straightness: 0.32, joints: 0.34, alignment: 0.18, reach: 0.16 },
      straightness: [0.73, 0.9],
      angles: { mcp: [1.95, 2.85], pip: [2.1, 2.92], dip: [1.9, 2.85] },
      alignment: [0.02, 0.52],
      reach: [0.54, 0.82],
      expectedLength: 0.78,
    },
  },
  thumb: {
    enter: 0.6,
    exit: 0.33,
    openFrames: 4,
    closeFrames: 2,
    minConfidence: 0.5,
    weights: { straightness: 0.26, joints: 0.26, spread: 0.18, outward: 0.18, reach: 0.12 },
    straightness: [0.6, 0.84],
    angles: { mcp: [1.95, 2.8], ip: [2.0, 2.85] },
    spread: [0.52, 0.86],
    outward: [0.12, 0.42],
    reach: [0.86, 1.16],
  },
};

/** Narrow tuning accessor for either kind of finger. */
export function tuningFor(finger: FingerName): FingerTuning | ThumbTuning {
  return finger === "thumb" ? FINGER_RECOGNITION.thumb : FINGER_RECOGNITION.fingers[finger];
}
