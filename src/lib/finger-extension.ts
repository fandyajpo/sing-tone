import type { FingerName, HandSample } from "../types/hand";
import { clamp01, pointAt } from "./hand-geometry";
import { FINGER_RECOGNITION } from "./finger-config";

/**
 * Per-finger geometric analysis.
 *
 * Everything is measured in the hand's own metric frame: x and z are scaled by
 * the frame aspect and every distance is normalized by palm width or palm
 * length, so camera distance, hand size and screen resolution never enter the
 * decision. Fingers are scored from four independent cues — chain straightness,
 * joint angles, alignment against the palm axis, and reach relative to that
 * finger's own expected length — and each finger has its own anatomical
 * expectations. The thumb uses a dedicated model based on abduction and
 * placement rather than finger-style curling.
 */

export type FingerScores = Record<FingerName, number>;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface HandFrameMetrics {
  aspect: number;
  /** Index knuckle to pinky knuckle, the hand's lateral scale unit. */
  palmWidth: number;
  /** Wrist to middle knuckle, the hand's longitudinal scale unit. */
  palmLength: number;
  handSpan: number;
  center: Vec3;
  /** Normalized wrist → middle-knuckle direction. */
  axis: Vec3;
  /** Normalized pinky → index knuckle direction (the thumb side). */
  lateral: Vec3;
  /** Palm plane normal. */
  normal: Vec3;
}

export type FingerAnomaly = "invalid-segment" | "folded-over" | "tip-in-palm";

export interface JointAngles {
  mcp: number;
  pip: number;
  dip: number;
}

export interface FingerGeometry {
  finger: FingerName;
  tip: Vec3;
  base: Vec3;
  /** Chain landmarks from base joint to tip. */
  points: readonly Vec3[];
  segments: readonly number[];
  chainLength: number;
  straightness: number;
  angles: JointAngles;
  /** Tip-to-base distance relative to palm width. */
  extensionRatio: number;
  /** Tip distance from the wrist relative to palm length. */
  reach: number;
  /** Knuckle-to-tip direction against the palm axis, -1..1. */
  alignment: number;
  /** Tip distance from the palm centre relative to palm width. */
  tipToPalm: number;
  /** Thumb-only: tip distance from the index knuckle, in palm widths. */
  spread: number;
  /** Thumb-only: how far the tip points away from the palm centre. */
  outward: number;
  score: number;
  anomaly: FingerAnomaly | null;
}

export interface HandAnalysis {
  metrics: HandFrameMetrics;
  fingers: Record<FingerName, FingerGeometry>;
}

export interface FingerCandidate {
  finger: FingerName;
  x: number;
  y: number;
  z: number;
  score: number;
}

export const FINGER_JOINTS: Record<
  Exclude<FingerName, "thumb">,
  { mcp: number; pip: number; dip: number; tip: number }
> = {
  index: { mcp: 5, pip: 6, dip: 7, tip: 8 },
  middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
  ring: { mcp: 13, pip: 14, dip: 15, tip: 16 },
  pinky: { mcp: 17, pip: 18, dip: 19, tip: 20 },
};

const THUMB = { cmc: 1, mcp: 2, ip: 3, tip: 4 } as const;

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: Vec3): Vec3 {
  const magnitude = length(a);
  if (magnitude < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: a.x / magnitude, y: a.y / magnitude, z: a.z / magnitude };
}

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function finite(point: Vec3): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

/** Interior angle at `b`, in radians (π means the three joints are collinear). */
function angleAt(a: Vec3, b: Vec3, c: Vec3): number {
  const v1 = sub(a, b);
  const v2 = sub(c, b);
  const m1 = length(v1);
  const m2 = length(v2);
  if (m1 < 1e-9 || m2 < 1e-9) return Math.PI;
  const cosine = Math.min(1, Math.max(-1, dot(v1, v2) / (m1 * m2)));
  return Math.acos(cosine);
}

export function smoothstep(value: number, edge0: number, edge1: number): number {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function landmarkAt(hand: HandSample, index: number, aspect: number): Vec3 {
  const landmark = pointAt(hand.landmarks, index);
  return { x: landmark.x * aspect, y: landmark.y, z: landmark.z * aspect };
}

/** Palm frame used as the geometric reference for every finger. */
export function handFrameMetrics(hand: HandSample, aspect: number): HandFrameMetrics {
  const wrist = landmarkAt(hand, 0, aspect);
  const indexBase = landmarkAt(hand, 5, aspect);
  const middleBase = landmarkAt(hand, 9, aspect);
  const pinkyBase = landmarkAt(hand, 17, aspect);

  const palmWidth = Math.max(dist3(indexBase, pinkyBase), 1e-4);
  const palmLength = Math.max(dist3(wrist, middleBase), 1e-4);
  const axis = normalize(sub(middleBase, wrist));
  const lateral = normalize(sub(indexBase, pinkyBase));
  const normal = normalize(cross(axis, lateral));
  const center: Vec3 = {
    x: (wrist.x + indexBase.x + middleBase.x + pinkyBase.x) / 4,
    y: (wrist.y + indexBase.y + middleBase.y + pinkyBase.y) / 4,
    z: (wrist.z + indexBase.z + middleBase.z + pinkyBase.z) / 4,
  };

  return {
    aspect,
    palmWidth,
    palmLength,
    handSpan: Math.max(palmWidth, palmLength),
    center,
    axis,
    lateral,
    normal,
  };
}

function chainStraightness(points: readonly Vec3[]): { straightness: number; total: number } {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const next = points[i];
    if (!previous || !next) continue;
    total += dist3(previous, next);
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || total < 1e-9) return { straightness: 0, total };
  return { straightness: dist3(first, last) / total, total };
}

function fingerGeometry(
  hand: HandSample,
  finger: Exclude<FingerName, "thumb">,
  aspect: number,
  metrics: HandFrameMetrics,
  expectedRatio: number | undefined,
): FingerGeometry {
  const joints = FINGER_JOINTS[finger];
  const wrist = landmarkAt(hand, 0, aspect);
  const mcp = landmarkAt(hand, joints.mcp, aspect);
  const pip = landmarkAt(hand, joints.pip, aspect);
  const dip = landmarkAt(hand, joints.dip, aspect);
  const tip = landmarkAt(hand, joints.tip, aspect);
  const points: readonly Vec3[] = [mcp, pip, dip, tip];

  const segments: readonly number[] = [
    dist3(mcp, pip),
    dist3(pip, dip),
    dist3(dip, tip),
  ];
  const { straightness, total } = chainStraightness(points);
  const angles: JointAngles = {
    mcp: angleAt(wrist, mcp, pip),
    pip: angleAt(mcp, pip, dip),
    dip: angleAt(pip, dip, tip),
  };
  const extensionRatio = dist3(mcp, tip) / metrics.palmWidth;
  const reach = dist3(wrist, tip) / metrics.palmLength;
  const direction = normalize(sub(tip, mcp));
  const alignment = dot(direction, metrics.axis);
  const tipToPalm = dist3(tip, metrics.center) / metrics.palmWidth;

  const tuning = FINGER_RECOGNITION.fingers[finger];
  const straightScore = smoothstep(straightness, tuning.straightness[0], tuning.straightness[1]);
  const jointScore =
    smoothstep(angles.mcp, tuning.angles.mcp[0], tuning.angles.mcp[1]) * 0.22 +
    smoothstep(angles.pip, tuning.angles.pip[0], tuning.angles.pip[1]) * 0.46 +
    smoothstep(angles.dip, tuning.angles.dip[0], tuning.angles.dip[1]) * 0.32;
  const alignmentScore = smoothstep(alignment, tuning.alignment[0], tuning.alignment[1]);
  const expected = expectedRatio ?? tuning.expectedLength;
  const reachScore = smoothstep(extensionRatio / Math.max(0.2, expected), tuning.reach[0], tuning.reach[1]);

  let score = clamp01(
    straightScore * tuning.weights.straightness +
      jointScore * tuning.weights.joints +
      alignmentScore * tuning.weights.alignment +
      reachScore * tuning.weights.reach,
  );

  // A tip that sits inside the palm cannot belong to an extended finger, no
  // matter how straight its chain looks.
  score *= 0.15 + 0.85 * smoothstep(tipToPalm, 0.16, 0.34);

  let anomaly: FingerAnomaly | null = null;
  const smallestSegment = Math.min(...segments);
  if (
    !finite(mcp) ||
    !finite(pip) ||
    !finite(dip) ||
    !finite(tip) ||
    total < metrics.palmWidth * 0.12 ||
    smallestSegment < metrics.palmWidth * 0.028
  ) {
    anomaly = "invalid-segment";
  } else if (alignment < -0.45) {
    anomaly = "folded-over";
  } else if (tipToPalm < 0.2) {
    anomaly = "tip-in-palm";
  }

  if (anomaly === "invalid-segment") score = 0;
  else if (anomaly) score = Math.min(score, 0.15);

  return {
    finger,
    tip,
    base: mcp,
    points,
    segments,
    chainLength: total,
    straightness,
    angles,
    extensionRatio,
    reach,
    alignment,
    tipToPalm,
    spread: 0,
    outward: 0,
    score,
    anomaly,
  };
}

function thumbGeometry(
  hand: HandSample,
  aspect: number,
  metrics: HandFrameMetrics,
): FingerGeometry {
  const wrist = landmarkAt(hand, 0, aspect);
  const cmc = landmarkAt(hand, THUMB.cmc, aspect);
  const mcp = landmarkAt(hand, THUMB.mcp, aspect);
  const ip = landmarkAt(hand, THUMB.ip, aspect);
  const tip = landmarkAt(hand, THUMB.tip, aspect);
  const indexBase = landmarkAt(hand, 5, aspect);
  const points: readonly Vec3[] = [cmc, mcp, ip, tip];

  const segments: readonly number[] = [
    dist3(cmc, mcp),
    dist3(mcp, ip),
    dist3(ip, tip),
  ];
  const { straightness, total } = chainStraightness(points);
  // The thumb's two functional joints live in mcp/pip; `dip` is unused.
  const angles: JointAngles = {
    mcp: angleAt(cmc, mcp, ip),
    pip: angleAt(mcp, ip, tip),
    dip: 0,
  };
  const extensionRatio = dist3(cmc, tip) / metrics.palmWidth;
  const reach = dist3(wrist, tip) / metrics.palmLength;
  const spread = dist3(tip, indexBase) / metrics.palmWidth;
  const tipToPalm = dist3(tip, metrics.center) / metrics.palmWidth;

  // The thumb side of the palm: from the centre towards the index knuckle.
  const thumbSide = normalize(sub(indexBase, metrics.center));
  const outwardLateral = dot(normalize(sub(tip, metrics.center)), thumbSide);
  const forward = dot(normalize(sub(tip, mcp)), metrics.axis);
  const outward = Math.max(outwardLateral, forward * 0.85);

  const tuning = FINGER_RECOGNITION.thumb;
  const straightScore = smoothstep(straightness, tuning.straightness[0], tuning.straightness[1]);
  const jointScore =
    smoothstep(angles.mcp, tuning.angles.mcp[0], tuning.angles.mcp[1]) * 0.55 +
    smoothstep(angles.pip, tuning.angles.ip[0], tuning.angles.ip[1]) * 0.45;
  const spreadScore = smoothstep(spread, tuning.spread[0], tuning.spread[1]);
  const outwardScore = smoothstep(outward, tuning.outward[0], tuning.outward[1]);
  const reachScore = smoothstep(reach, tuning.reach[0], tuning.reach[1]);

  let score = clamp01(
    straightScore * tuning.weights.straightness +
      jointScore * tuning.weights.joints +
      spreadScore * tuning.weights.spread +
      outwardScore * tuning.weights.outward +
      reachScore * tuning.weights.reach,
  );

  // A thumb lying across the palm keeps low outward placement even when it is
  // straight, so placement gates the final score.
  score *= 0.35 + 0.65 * Math.max(spreadScore, outwardScore);

  // Accumulated thumb curl. A thumb bent across its two joints is not extended
  // even when its tip still sits far from the palm, so the joint chain gates it.
  const curl = Math.max(0, Math.PI - angles.mcp) + Math.max(0, Math.PI - angles.pip);
  score *= 1 - smoothstep(curl, 0.5, 1.7);

  let anomaly: FingerAnomaly | null = null;
  if (
    !finite(cmc) ||
    !finite(mcp) ||
    !finite(ip) ||
    !finite(tip) ||
    total < metrics.palmWidth * 0.14 ||
    Math.min(...segments) < metrics.palmWidth * 0.03
  ) {
    anomaly = "invalid-segment";
  } else if (outward < -0.2) {
    anomaly = "folded-over";
  } else if (tipToPalm < 0.22) {
    anomaly = "tip-in-palm";
  }

  if (anomaly === "invalid-segment") score = 0;
  else if (anomaly) score = Math.min(score, 0.18);

  return {
    finger: "thumb",
    tip,
    base: cmc,
    points,
    segments,
    chainLength: total,
    straightness,
    angles,
    extensionRatio,
    reach,
    alignment: outward,
    tipToPalm,
    spread,
    outward,
    score,
    anomaly,
  };
}

/**
 * Full geometric read of one hand. `expected` optionally supplies a calibrated
 * tip-to-knuckle / palm-width ratio per finger.
 */
export function analyzeHand(
  hand: HandSample,
  aspect: number,
  expected?: Partial<Record<FingerName, number>>,
): HandAnalysis {
  const metrics = handFrameMetrics(hand, aspect);
  return {
    metrics,
    fingers: {
      thumb: thumbGeometry(hand, aspect, metrics),
      index: fingerGeometry(hand, "index", aspect, metrics, expected?.index),
      middle: fingerGeometry(hand, "middle", aspect, metrics, expected?.middle),
      ring: fingerGeometry(hand, "ring", aspect, metrics, expected?.ring),
      pinky: fingerGeometry(hand, "pinky", aspect, metrics, expected?.pinky),
    },
  };
}

export function fingerExtensionScores(hand: HandSample, aspect: number): FingerScores {
  const analysis = analyzeHand(hand, aspect);
  return {
    thumb: analysis.fingers.thumb.score,
    index: analysis.fingers.index.score,
    middle: analysis.fingers.middle.score,
    ring: analysis.fingers.ring.score,
    pinky: analysis.fingers.pinky.score,
  };
}

/**
 * Tip proximity resolver. Two fingertips that land on almost the same spot
 * cannot both be trusted: one is likely hidden behind the other. The clearer
 * finger wins by score, then by depth; when neither wins, both are suppressed.
 */
export function resolveOcclusions(
  candidates: readonly FingerCandidate[],
  palmWidth: number,
): Set<FingerName> {
  const suppressed = new Set<FingerName>();
  const proximity = Math.max(palmWidth * FINGER_RECOGNITION.occlusion.proximity, 0.01);
  const depthGap = FINGER_RECOGNITION.occlusion.depthGap;

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

      const gap = a.z - b.z;
      if (Math.abs(gap) > depthGap) {
        suppressed.add(gap > 0 ? a.finger : b.finger);
      } else {
        suppressed.add(a.finger);
        suppressed.add(b.finger);
      }
    }
  }

  return suppressed;
}
