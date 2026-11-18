import type { FingerName, HandSample } from "../types/hand";
import { pointAt, clamp } from "./hand-geometry";
import { EXTENSION_CONFIG, fingerExtensionScores } from "./finger-extension";
import type { ChordMode, ChordVoicing } from "./gesture-chords";

export const FINGER_ORDER: readonly FingerName[] = ["thumb", "index", "middle", "ring", "pinky"];

export type ExtendedMap = Record<FingerName, boolean>;

export interface HandPose {
  present: boolean;
  extended: ExtendedMap;
  /** Extended index→pinky count (the thumb is handled separately). */
  nonThumbCount: number;
  /** Knuckle-line tilt, -1..1. Positive = index knuckle lower than the pinky. */
  tilt: number;
  /** Wrist height in the frame, 0 (bottom) .. 1 (top). */
  height: number;
}

const EMPTY_EXTENDED: ExtendedMap = {
  thumb: false,
  index: false,
  middle: false,
  ring: false,
  pinky: false,
};

export const ABSENT_POSE: HandPose = {
  present: false,
  extended: EMPTY_EXTENDED,
  nonThumbCount: 0,
  tilt: 0,
  height: 0.5,
};

interface FingerGate {
  score: number;
  extended: boolean;
  enteredAt: number;
  exitedAt: number;
}

function makeGate(): FingerGate {
  return { score: 0, extended: false, enteredAt: 0, exitedAt: 0 };
}

/**
 * Turns the per-finger extension scores into a debounced hand pose. Same
 * hysteresis and debounce rules as the fingertip detector, so a single noisy
 * frame can never flip a chord.
 */
export class GestureHandTracker {
  private gates: Record<FingerName, FingerGate> = {
    thumb: makeGate(),
    index: makeGate(),
    middle: makeGate(),
    ring: makeGate(),
    pinky: makeGate(),
  };

  /** Sensitivity 0..1 lowers the extension threshold; smoothing 0..1 slows the score. */
  private enter = EXTENSION_CONFIG.enter;
  private exit = EXTENSION_CONFIG.exit;
  private alpha = EXTENSION_CONFIG.smoothing;

  configure(sensitivity: number, smoothing: number): void {
    const s = Math.max(0, Math.min(1, sensitivity));
    const m = Math.max(0, Math.min(1, smoothing));
    this.enter = 0.32 + (1 - s) * 0.4;
    this.exit = Math.max(0.12, this.enter - 0.17);
    this.alpha = 0.1 + (1 - m) * 0.42;
  }

  update(hand: HandSample | null, aspect: number, now: number): HandPose {
    if (!hand || hand.landmarks.length < 21) {
      for (const finger of FINGER_ORDER) {
        const gate = this.gates[finger];
        gate.score = 0;
        gate.extended = false;
        gate.enteredAt = 0;
        gate.exitedAt = 0;
      }
      return ABSENT_POSE;
    }

    const scores = fingerExtensionScores(hand, aspect);
    const extended: ExtendedMap = { ...EMPTY_EXTENDED };

    for (const finger of FINGER_ORDER) {
      const gate = this.gates[finger];
      const raw = scores[finger] ?? 0;
      gate.score += (raw - gate.score) * this.alpha;

      if (!gate.extended) {
        if (gate.score >= this.enter) {
          if (gate.enteredAt === 0) gate.enteredAt = now;
          if (now - gate.enteredAt >= EXTENSION_CONFIG.debounceMs) gate.extended = true;
        } else {
          gate.enteredAt = 0;
        }
      } else if (gate.score <= this.exit) {
        if (gate.exitedAt === 0) gate.exitedAt = now;
        if (now - gate.exitedAt >= EXTENSION_CONFIG.debounceMs) gate.extended = false;
      } else {
        gate.exitedAt = 0;
      }

      extended[finger] = gate.extended;
    }

    const indexBase = pointAt(hand.landmarks, 5);
    const pinkyBase = pointAt(hand.landmarks, 17);
    const wrist = pointAt(hand.landmarks, 0);
    const dx = (indexBase.x - pinkyBase.x) * aspect;
    const dy = indexBase.y - pinkyBase.y;
    const knuckleSpan = Math.hypot(dx, dy);
    const tilt = knuckleSpan > 1e-6 ? clamp(dy / knuckleSpan, -1, 1) : 0;

    const nonThumbCount = (["index", "middle", "ring", "pinky"] as const).filter(
      (finger) => extended[finger],
    ).length;

    return {
      present: true,
      extended,
      nonThumbCount,
      tilt,
      height: clamp(1 - wrist.y, 0, 1),
    };
  }
}

/**
 * Left hand → scale degree I..VII.
 * 1–4 extended fingers, all five for V, index+pinky for VI,
 * index+pinky+thumb for VII. A fist returns null, which mutes the chord.
 */
export function degreeFromPose(pose: HandPose): number | null {
  if (!pose.present) return null;
  const { extended } = pose;
  const thumb = extended.thumb;

  if (extended.index && extended.pinky && thumb && !extended.middle && !extended.ring) {
    return 6;
  }
  if (extended.index && extended.pinky && !thumb && !extended.middle && !extended.ring) {
    return 5;
  }
  if (pose.nonThumbCount === 4 && thumb) return 4;
  if (pose.nonThumbCount >= 1 && pose.nonThumbCount <= 4) return pose.nonThumbCount - 1;
  return null;
}

/** Right hand → chord voicing from the number of extended non-thumb fingers. */
export function voicingFromPose(pose: HandPose): ChordVoicing | null {
  if (!pose.present) return null;
  switch (pose.nonThumbCount) {
    case 1:
      return "root";
    case 2:
      return "first";
    case 3:
      return "seventh";
    case 4:
      return "dominant";
    default:
      return null;
  }
}

/** Left-hand knuckle tilt: index side down = major, index side up = minor. */
export function modeFromPose(pose: HandPose): ChordMode {
  if (!pose.present) return "diatonic";
  if (pose.tilt > 0.22) return "major";
  if (pose.tilt < -0.22) return "minor";
  return "diatonic";
}

/** Right thumb out lowers the octave, thumb tucked in raises it. */
export function octaveShiftFromPose(pose: HandPose): number {
  if (!pose.present) return 0;
  return pose.extended.thumb ? -1 : 1;
}
