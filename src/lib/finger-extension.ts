import type { FingerName, HandSample } from "../types/hand";
import { clamp01, pointAt } from "./hand-geometry";

/**
 * Per-finger extension scoring, derived from landmark geometry only.
 *
 * Every measure is normalized against that hand's own palm size, so the score
 * does not care about hand size, camera distance or rotation:
 *  - chain straightness: direct tip-to-base distance over the summed segment
 *    lengths (1 = perfectly straight, ~0.4 = folded back toward the palm)
 *  - joint angles at PIP and DIP (an extended finger is nearly flat there)
 *  - reach: the tip must sit further from the wrist than the middle joint
 *  - thumb: its own model, built around abduction from the index base plus the
 *    IP/MCP angles, because the thumb folds sideways rather than curling down.
 */

export type FingerScores = Record<FingerName, number>;

export interface ExtensionConfig {
  /** Smoothed score needed to arm a fingertip. */
  enter: number;
  /** Score below which an armed fingertip disarms (hysteresis). */
  exit: number;
  /** How long the score must hold before the state flips. */
  debounceMs: number;
  /** Temporal smoothing factor for the score, 0..1. */
  smoothing: number;
}

export const EXTENSION_CONFIG: ExtensionConfig = {
  enter: 0.6,
  exit: 0.38,
  debounceMs: 90,
  smoothing: 0.35,
};

interface Vec2 {
  x: number;
  y: number;
}

export interface HandFrameMetrics {
  aspect: number;
  /** Distance between the index and pinky knuckles: the hand's scale unit. */
  palmWidth: number;
  palmLength: number;
}

export interface FingerCandidate {
  finger: FingerName;
  /** Metric-space position (x already multiplied by the frame aspect). */
  x: number;
  y: number;
  z: number;
  score: number;
}

const FINGER_JOINTS: Record<
  Exclude<FingerName, "thumb">,
  { mcp: number; pip: number; dip: number; tip: number }
> = {
  index: { mcp: 5, pip: 6, dip: 7, tip: 8 },
  middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
  ring: { mcp: 13, pip: 14, dip: 15, tip: 16 },
  pinky: { mcp: 17, pip: 18, dip: 19, tip: 20 },
};

const THUMB = { cmc: 1, mcp: 2, ip: 3, tip: 4 };

function landmarkAt(hand: HandSample, index: number, aspect: number): Vec2 {
  const landmark = pointAt(hand.landmarks, index);
  return { x: landmark.x * aspect, y: landmark.y };
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Interior angle at `b`, in radians (π means the joints are collinear). */
function angleAt(a: Vec2, b: Vec2, c: Vec2): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 < 1e-6 || m2 < 1e-6) return Math.PI;
  const cosine = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (m1 * m2)));
  return Math.acos(cosine);
}

export function smoothstep(value: number, edge0: number, edge1: number): number {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function handFrameMetrics(hand: HandSample, aspect: number): HandFrameMetrics {
  const wrist = landmarkAt(hand, 0, aspect);
  const indexBase = landmarkAt(hand, 5, aspect);
  const middleBase = landmarkAt(hand, 9, aspect);
  const pinkyBase = landmarkAt(hand, 17, aspect);
  const palmWidth = Math.max(dist(indexBase, pinkyBase), 1e-4);
  const palmLength = Math.max(dist(wrist, middleBase), 1e-4);
  return { aspect, palmWidth, palmLength };
}

function chainStraightness(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  const total = dist(a, b) + dist(b, c) + dist(c, d);
  if (total < 1e-6) return 0;
  return dist(a, d) / total;
}

function fingerScore(
  hand: HandSample,
  finger: Exclude<FingerName, "thumb">,
  aspect: number,
): number {
  const joints = FINGER_JOINTS[finger];
  const wrist = landmarkAt(hand, 0, aspect);
  const mcp = landmarkAt(hand, joints.mcp, aspect);
  const pip = landmarkAt(hand, joints.pip, aspect);
  const dip = landmarkAt(hand, joints.dip, aspect);
  const tip = landmarkAt(hand, joints.tip, aspect);

  const straightness = chainStraightness(mcp, pip, dip, tip);
  const straightScore = smoothstep(straightness, 0.8, 0.97);

  const pipScore = smoothstep(angleAt(mcp, pip, dip), 2.0, 2.9);
  const dipScore = smoothstep(angleAt(pip, dip, tip), 1.9, 2.9);

  // An extended fingertip reaches past the PIP joint; a curled one pulls back.
  const reach = dist(tip, wrist) / Math.max(dist(pip, wrist), 1e-4);
  const reachScore = smoothstep(reach, 1.0, 1.2);

  // Pinky and ring are shorter and naturally more curved, so they lean a little
  // less on raw straightness than the index and middle fingers.
  const isOuter = finger === "ring" || finger === "pinky";
  const straightWeight = isOuter ? 0.38 : 0.45;
  const angleWeight = isOuter ? 0.32 : 0.28;

  return clamp01(
    straightScore * straightWeight +
      pipScore * angleWeight +
      dipScore * 0.17 +
      reachScore * (1 - straightWeight - angleWeight - 0.17),
  );
}

function thumbScore(hand: HandSample, aspect: number, metrics: HandFrameMetrics): number {
  const wrist = landmarkAt(hand, 0, aspect);
  const cmc = landmarkAt(hand, THUMB.cmc, aspect);
  const mcp = landmarkAt(hand, THUMB.mcp, aspect);
  const ip = landmarkAt(hand, THUMB.ip, aspect);
  const tip = landmarkAt(hand, THUMB.tip, aspect);
  const indexBase = landmarkAt(hand, 5, aspect);

  const straightness = chainStraightness(cmc, mcp, ip, tip);
  const straightScore = smoothstep(straightness, 0.68, 0.9);

  const ipScore = smoothstep(angleAt(mcp, ip, tip), 1.85, 2.85);
  const mcpScore = smoothstep(angleAt(cmc, mcp, ip), 1.7, 2.9);

  // Abduction is what separates an extended thumb from one tucked across the
  // palm: a folded thumb collapses toward the index knuckle.
  const abduction = dist(tip, indexBase) / metrics.palmWidth;
  const abductionScore = smoothstep(abduction, 0.5, 0.88);

  const reach = dist(tip, wrist) / metrics.palmLength;
  const reachScore = smoothstep(reach, 0.95, 1.3);

  // Shape alone is not enough for a thumb: a thumb folded across the palm is
  // still straight. Placement (abduction away from the palm, and reach past the
  // palm) gates the shape score, so a tucked thumb can never arm.
  const shape = straightScore * 0.4 + ipScore * 0.3 + mcpScore * 0.3;
  const placement = abductionScore * 0.65 + reachScore * 0.35;
  return clamp01(shape * (0.2 + 0.8 * placement));
}

export function fingerExtensionScores(hand: HandSample, aspect: number): FingerScores {
  const metrics = handFrameMetrics(hand, aspect);
  return {
    thumb: thumbScore(hand, aspect, metrics),
    index: fingerScore(hand, "index", aspect),
    middle: fingerScore(hand, "middle", aspect),
    ring: fingerScore(hand, "ring", aspect),
    pinky: fingerScore(hand, "pinky", aspect),
  };
}

/**
 * Occlusion / ambiguity filter. Two armed fingertips that land on almost the
 * same spot cannot both be trusted: one is likely hidden behind the other. The
 * clearer finger wins; when neither wins, both are suppressed.
 */
export function resolveOcclusions(
  candidates: readonly FingerCandidate[],
  palmWidth: number,
): Set<FingerName> {
  const suppressed = new Set<FingerName>();
  // Only near-identical positions count as stacking; fingers held side by side
  // with a normal gap must both stay playable.
  const proximity = Math.max(palmWidth * 0.16, 0.01);

  for (let i = 0; i < candidates.length; i += 1) {
    const a = candidates[i];
    if (!a) continue;
    for (let j = i + 1; j < candidates.length; j += 1) {
      const b = candidates[j];
      if (!b) continue;

      const separation = Math.hypot(a.x - b.x, a.y - b.y);
      if (separation > proximity) continue;

      const scoreGap = a.score - b.score;
      if (scoreGap > 0.15) {
        suppressed.add(b.finger);
        continue;
      }
      if (-scoreGap > 0.15) {
        suppressed.add(a.finger);
        continue;
      }

      // Scores are close: fall back to depth. Larger z sits further from the
      // camera, which is the finger being hidden.
      const depthGap = a.z - b.z;
      if (Math.abs(depthGap) > 0.015) {
        suppressed.add(depthGap > 0 ? a.finger : b.finger);
      } else {
        suppressed.add(a.finger);
        suppressed.add(b.finger);
      }
    }
  }

  return suppressed;
}
