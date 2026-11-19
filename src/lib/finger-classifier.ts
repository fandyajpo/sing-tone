import { clamp01, pointAt } from "./hand-geometry";
import {
  fingerExtensionScores,
  handFrameMetrics,
  resolveOcclusions,
} from "./finger-extension";
import type { FingerCandidate } from "./finger-extension";
import { FINGER_LANDMARK, FINGER_NAMES } from "../types/hand";
import type { FingerName, HandSample } from "../types/hand";

export type FingerState =
  | "hidden"
  | "folded"
  | "partially_extended"
  | "extended"
  | "occluded"
  | "unstable"
  | "active";

export interface FingerReading {
  finger: FingerName;
  state: FingerState;
  /** Smoothed extension score, 0..1. */
  extension: number;
  /** Temporal trust built from consistent frames, 0..1. */
  confidence: number;
  visible: boolean;
  /** Mirrored display-space position of the fingertip. */
  x: number;
  y: number;
  /** True while the finger is allowed to drive audio. */
  active: boolean;
}

export type FingerReadings = Record<FingerName, FingerReading>;

/** How long a finger keeps its voice after it stops qualifying. */
const GRACE_MS = 190;
/** Minimum time above the entry threshold before a finger may sound. */
const STABLE_MS = 55;
/** Score at which a finger reads as partially open. */
const PARTIAL_SCORE = 0.34;

interface FingerEntry {
  score: number;
  confidence: number;
  active: boolean;
  heldSince: number;
  lostAt: number;
  reading: FingerReading;
}

function blankReading(finger: FingerName): FingerReading {
  return {
    finger,
    state: "hidden",
    extension: 0,
    confidence: 0,
    visible: false,
    x: 0.5,
    y: 0.5,
    active: false,
  };
}

/**
 * Per-finger state classifier.
 *
 * It fuses the geometric extension score with visibility, occlusion and the
 * finger's own history, so a single noisy frame can never arm a fingertip and a
 * folded finger never inherits its neighbour's activity.
 */
export class FingerClassifier {
  private readonly entries = new Map<FingerName, FingerEntry>();
  private enter = 0.56;
  private exit = 0.36;
  private alpha = 0.34;

  constructor() {
    for (const finger of FINGER_NAMES) {
      this.entries.set(finger, {
        score: 0,
        confidence: 0,
        active: false,
        heldSince: 0,
        lostAt: 0,
        reading: blankReading(finger),
      });
    }
  }

  configure(sensitivity: number, smoothing: number): void {
    const s = clamp01(sensitivity);
    const m = clamp01(smoothing);
    this.enter = 0.62 - s * 0.2;
    this.exit = Math.max(0.22, this.enter - 0.16);
    this.alpha = 0.22 + (1 - m) * 0.42;
  }

  reset(): void {
    for (const entry of this.entries.values()) {
      entry.score = 0;
      entry.confidence = 0;
      entry.active = false;
      entry.heldSince = 0;
      entry.lostAt = 0;
      entry.reading = blankReading(entry.reading.finger);
    }
  }

  update(hand: HandSample | null, aspect: number, now: number): FingerReadings {
    const out = {} as FingerReadings;

    if (!hand || hand.landmarks.length < 21) {
      for (const [finger, entry] of this.entries) {
        if (entry.active && now - entry.lostAt > GRACE_MS) entry.active = false;
        entry.score *= 0.8;
        entry.confidence *= 0.85;
        const reading = entry.reading;
        reading.state = "hidden";
        reading.visible = false;
        reading.extension = entry.score;
        reading.confidence = entry.confidence;
        reading.active = entry.active;
        out[finger] = reading;
      }
      return out;
    }

    const scores = fingerExtensionScores(hand, aspect);
    const metrics = handFrameMetrics(hand, aspect);
    const tips = new Map<
      FingerName,
      { x: number; y: number; z: number; score: number; visible: boolean }
    >();

    for (const finger of FINGER_NAMES) {
      const point = pointAt(hand.landmarks, FINGER_LANDMARK[finger]);
      const inFrame = point.x > 0.008 && point.x < 0.992 && point.y > 0.004 && point.y < 0.996;
      tips.set(finger, {
        x: 1 - point.x,
        y: point.y,
        z: point.z,
        score: scores[finger] ?? 0,
        visible: inFrame,
      });
    }

    // Overlapping fingertips cannot both be trusted: resolve them per hand.
    const candidates: FingerCandidate[] = [];
    for (const finger of FINGER_NAMES) {
      const tip = tips.get(finger);
      if (!tip || !tip.visible || tip.score < this.exit) continue;
      candidates.push({
        finger,
        x: tip.x * aspect,
        y: tip.y,
        z: tip.z,
        score: tip.score,
      });
    }
    const suppressed = resolveOcclusions(candidates, metrics.palmWidth);

    for (const finger of FINGER_NAMES) {
      const entry = this.entries.get(finger);
      const tip = tips.get(finger);
      if (!entry || !tip) continue;

      const raw = tip.score;
      entry.score += (raw - entry.score) * this.alpha;

      // Confidence rewards consistently high geometry and punishes gaps.
      const target = tip.visible ? clamp01(entry.score * 0.9 + 0.1) : 0;
      entry.confidence += (target - entry.confidence) * 0.22;

      let state: FingerState;
      if (!tip.visible) {
        state = "hidden";
        entry.active = false;
        entry.heldSince = 0;
      } else if (suppressed.has(finger)) {
        state = "occluded";
        entry.heldSince = 0;
        if (entry.active && now - (entry.lostAt || now) > GRACE_MS) entry.active = false;
      } else {
        if (entry.active) {
          if (entry.score < this.exit) {
            if (entry.lostAt === 0) entry.lostAt = now;
            if (now - entry.lostAt > GRACE_MS) {
              entry.active = false;
              entry.lostAt = 0;
              entry.heldSince = 0;
            }
          } else {
            entry.lostAt = 0;
          }
        } else if (entry.score >= this.enter && entry.confidence >= 0.42) {
          if (entry.heldSince === 0) entry.heldSince = now;
          if (now - entry.heldSince >= STABLE_MS) entry.active = true;
        } else {
          entry.heldSince = 0;
        }

        if (entry.active) state = "active";
        else if (entry.score >= this.enter) state = "unstable";
        else if (entry.score >= PARTIAL_SCORE) state = "partially_extended";
        else if (entry.score >= this.exit) state = "extended";
        else state = "folded";
      }

      const reading = entry.reading;
      reading.finger = finger;
      reading.state = state;
      reading.extension = entry.score;
      reading.confidence = entry.confidence;
      reading.visible = tip.visible;
      reading.x = tip.x;
      reading.y = tip.y;
      reading.active = entry.active;
      out[finger] = reading;
    }

    return out;
  }
}
