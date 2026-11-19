import type { FingerReading } from "./finger-classifier";
import type { Handedness } from "../types/hand";

export interface FingerDebugHand {
  hand: Handedness;
  present: boolean;
  profileSamples: number;
  readings: readonly FingerReading[];
}

export interface FingerDebugSnapshot {
  hands: readonly FingerDebugHand[];
  at: number;
}

let snapshot: FingerDebugSnapshot = { hands: [], at: 0 };
const listeners = new Set<() => void>();
let recalibrationRequested = false;

/**
 * A tiny external store for the development overlay. Tracking publishes at a
 * low rate; React never sits in the per-frame loop.
 */
export function publishFingerDebug(hands: readonly FingerDebugHand[], at: number): void {
  snapshot = { hands, at };
  for (const listener of listeners) listener();
}

export function subscribeFingerDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFingerDebugSnapshot(): FingerDebugSnapshot {
  return snapshot;
}

export function requestRecalibration(): void {
  recalibrationRequested = true;
}

/** Consumed by a recognizer on its next frame. */
export function consumeRecalibrationRequest(): boolean {
  const requested = recalibrationRequested;
  recalibrationRequested = false;
  return requested;
}
