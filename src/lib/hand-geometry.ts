import type { FingertipSample, HandSample, Landmark } from "../types/hand";
import { FINGER_LANDMARK, FINGER_NAMES } from "../types/hand";

export interface Point {
  x: number;
  y: number;
}

/**
 * Maps normalized video content coordinates onto a canvas that visually covers
 * the whole viewport (equivalent to CSS `object-fit: cover`).
 */
export interface Projection {
  width: number;
  height: number;
  drawWidth: number;
  drawHeight: number;
  offsetX: number;
  offsetY: number;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function projectionFor(
  videoWidth: number,
  videoHeight: number,
  width: number,
  height: number,
): Projection {
  const vw = videoWidth > 0 ? videoWidth : 1280;
  const vh = videoHeight > 0 ? videoHeight : 720;
  const scale = Math.max(width / vw, height / vh);
  const drawWidth = vw * scale;
  const drawHeight = vh * scale;
  return {
    width,
    height,
    drawWidth,
    drawHeight,
    offsetX: (width - drawWidth) / 2,
    offsetY: (height - drawHeight) / 2,
  };
}

/** Converts display-normalized coordinates (already mirrored) into canvas pixels. */
export function projectPoint(x: number, y: number, projection: Projection): Point {
  return {
    x: projection.offsetX + x * projection.drawWidth,
    y: projection.offsetY + y * projection.drawHeight,
  };
}

/** Flips a raw video landmark into mirrored display space. */
export function mirrorX(landmark: Landmark): number {
  return 1 - landmark.x;
}

export function pointAt(landmarks: Landmark[], index: number): Landmark {
  const landmark = landmarks[index];
  return landmark ?? { x: 0.5, y: 0.5, z: 0 };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Display-space landmarks (mirrored horizontally) for one hand. */
export function displayLandmarks(hand: HandSample): Point[] {
  return hand.landmarks.map((landmark) => ({ x: 1 - landmark.x, y: landmark.y }));
}

export function fingertipsOf(hand: HandSample): FingertipSample[] {
  const samples: FingertipSample[] = [];
  for (const finger of FINGER_NAMES) {
    const landmark = pointAt(hand.landmarks, FINGER_LANDMARK[finger]);
    samples.push({
      key: `${hand.handedness}:${finger}`,
      hand: hand.handedness,
      finger,
      x: 1 - landmark.x,
      y: landmark.y,
      z: landmark.z,
    });
  }
  return samples;
}

/** Distance between the wrist and the middle-finger base, used to scale visuals. */
export function palmScale(hand: HandSample): number {
  const wrist = pointAt(hand.landmarks, 0);
  const base = pointAt(hand.landmarks, 9);
  return Math.max(0.06, Math.hypot(1 - wrist.x - (1 - base.x), wrist.y - base.y));
}

/** Higher `smoothing` means a smoother, slower follow; 0 means raw tracking. */
export function smoothingAlpha(smoothing: number): number {
  return 1 - clamp01(smoothing) * 0.86;
}
