import { followAlpha, midiFromY, type PitchWindow } from "./pitch-mapping";

/** Semitones per second below which a finger counts as still. */
export const STILL_SPEED = 0.35;
/** Raw Y jump treated as tracking re-acquisition rather than a slide. */
const JUMP_THRESHOLD = 0.12;

export type PitchPhase = "idle" | "detected" | "active" | "bending" | "released";

export interface PitchFeel {
  window: PitchWindow;
  sensitivity: number;
  smoothing: number;
  responseMs: number;
  deadZone: number;
}

export interface PitchVoiceState {
  /** Smoothed fingertip Y (0 top .. 1 bottom). */
  y: number;
  lastY: number;
  /** Fractional MIDI note currently held. */
  midi: number;
  /** Smoothed vertical speed in semitones/second, positive = rising pitch. */
  speed: number;
  velocity: number;
  phase: PitchPhase;
  noteChangedAt: number;
}

export interface PitchStep {
  /** True when the fractional pitch moved enough to send a new frequency. */
  midiChanged: boolean;
  /** Ramp time for that frequency change. */
  glide: number;
}

export function createVoiceState(y: number, feel: PitchFeel, now: number): PitchVoiceState {
  return {
    y,
    lastY: y,
    midi: midiFromY(y, feel.window, feel.sensitivity),
    speed: 0,
    velocity: 0.78,
    phase: "active",
    noteChangedAt: now - 1000,
  };
}

function glideFor(feel: PitchFeel): number {
  return Math.min(0.1, Math.max(0.02, (feel.responseMs / 1000) * 0.45));
}

/**
 * Advances one fingertip by one frame.
 *
 * - Exponential follow on Y, frame-rate independent.
 * - A dead zone freezes tiny jitter so a held finger keeps its note.
 * - A large jump (hand re-acquired) snaps instead of gliding across the frame.
 * - Pitch is only rewritten when it actually moved, which keeps stationary
 *   fingers from spamming the audio graph.
 */
export function advanceVoiceState(
  state: PitchVoiceState,
  rawY: number,
  dt: number,
  feel: PitchFeel,
  now: number,
): PitchStep {
  const alpha = Math.min(
    0.92,
    followAlpha(dt, feel.responseMs) * (0.6 + (1 - feel.smoothing) * 0.7),
  );

  const delta = rawY - state.y;
  if (Math.abs(delta) > JUMP_THRESHOLD) {
    state.y = rawY;
  } else if (Math.abs(delta) > feel.deadZone) {
    state.y += delta * alpha;
  }

  const movement = -(rawY - state.lastY) / dt;
  state.speed += (movement - state.speed) * 0.28;

  const nextMidi = midiFromY(state.y, feel.window, feel.sensitivity);
  let midiChanged = false;
  if (Math.abs(nextMidi - state.midi) > 0.015) {
    state.midi = nextMidi;
    state.noteChangedAt = now;
    midiChanged = true;
  }

  state.phase = Math.abs(state.speed) > STILL_SPEED ? "bending" : "active";
  return { midiChanged, glide: glideFor(feel) };
}
