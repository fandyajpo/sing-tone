import { midiToNote } from "../types/piano";
import { clamp01 } from "./hand-geometry";

/** A continuous MIDI window; bounds are integers, pitches between them are real. */
export interface PitchWindow {
  low: number;
  high: number;
}

export interface PitchReading {
  /** Fractional MIDI note. */
  midi: number;
  /** Nearest whole note, e.g. "C#4". */
  note: string;
  octave: number;
  pitchClass: string;
  /** Deviation from the nearest note, -50..50. */
  cents: number;
  hz: number;
}

export const MIN_PITCH_SPAN = 12;

export function frequencyFor(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function clampWindow(low: number, high: number, rangeLow: number, rangeHigh: number): PitchWindow {
  const ceiling = Math.max(rangeLow + MIN_PITCH_SPAN, rangeHigh);
  const lo = clampRange(Math.round(low), rangeLow, ceiling - MIN_PITCH_SPAN);
  const hi = clampRange(Math.round(high), lo + MIN_PITCH_SPAN, ceiling);
  return { low: lo, high: hi };
}

function clampRange(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Symmetric window of `range` semitones around the preset's centre. */
export function windowForBendRange(rangeLow: number, rangeHigh: number, semitones: number): PitchWindow {
  const centre = (rangeLow + rangeHigh) / 2;
  const half = Math.max(MIN_PITCH_SPAN, Math.min(semitones, rangeHigh - rangeLow)) / 2;
  return clampWindow(centre - half, centre + half, rangeLow, rangeHigh);
}

/**
 * Vertical position → continuous pitch.
 *
 * MediaPipe's Y origin is the top-left of the frame, so `1 - y` turns "higher in
 * the frame" into "higher pitch". Sensitivity widens or narrows the travel
 * around the centre without ever leaving the window.
 */
export function midiFromY(y: number, window: PitchWindow, sensitivity: number): number {
  const height = clamp01(1 - y);
  const sensitivityScale = 0.35 + clamp01(sensitivity) * 0.65;
  const shaped = clamp01(0.5 + (height - 0.5) * sensitivityScale);
  return window.low + shaped * (window.high - window.low);
}

export function readPitch(midi: number): PitchReading {
  const nearest = Math.round(midi);
  const note = midiToNote(nearest);
  const octave = Math.floor(nearest / 12) - 1;
  return {
    midi,
    note,
    octave,
    pitchClass: note.slice(0, -1),
    cents: Math.round((midi - nearest) * 100),
    hz: frequencyFor(midi),
  };
}

/** Exponential follow that is frame-rate independent. */
export function followAlpha(dtSeconds: number, timeConstantMs: number): number {
  const tau = Math.max(0.008, timeConstantMs / 1000);
  return 1 - Math.exp(-dtSeconds / tau);
}

export function noteNameFor(midi: number): string {
  return midiToNote(Math.round(midi));
}
