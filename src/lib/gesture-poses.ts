import type { HandSample } from "../types/hand";
import { pointAt, clamp } from "./hand-geometry";
import type { FingerReadings } from "./finger-classifier";
import type { ChordMode, ChordVoicing } from "./gesture-chords";

export const FINGER_ORDER = ["thumb", "index", "middle", "ring", "pinky"] as const;

export type ExtendedMap = Record<(typeof FINGER_ORDER)[number], boolean>;

export interface HandPose {
  present: boolean;
  extended: ExtendedMap;
  /** OPEN index→pinky count (the thumb is handled separately). */
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

/**
 * Converts per-finger recognition into the chord pose. A finger only counts
 * when the recognizer has it OPEN, so folded, partial, occluded, unstable and
 * unknown fingers can never build a chord.
 */
export class GestureHandTracker {
  update(hand: HandSample | null, readings: FingerReadings | null, aspect = 1): HandPose {
    if (!hand || hand.landmarks.length < 21 || !readings) return ABSENT_POSE;

    const extended: ExtendedMap = { ...EMPTY_EXTENDED };
    for (const finger of FINGER_ORDER) {
      extended[finger] = readings[finger]?.active === true && readings[finger]?.state === "OPEN";
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
 * 1–4 open fingers, all five for V, index+pinky for VI,
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

/** Right hand → chord voicing from the number of OPEN non-thumb fingers. */
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

/** Right thumb OPEN lowers the octave, thumb closed raises it. */
export function octaveShiftFromPose(pose: HandPose): number {
  if (!pose.present) return 0;
  return pose.extended.thumb ? -1 : 1;
}
