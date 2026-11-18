import type { FingerKey } from "./hand";

export type PitchPhase = "idle" | "detected" | "active" | "bending" | "released";

export type PitchDirection = -1 | 0 | 1;

/** One fingertip's live pitch voice, as shown by the meter. */
export interface PitchVoice {
  key: FingerKey;
  finger: string;
  hand: "left" | "right";
  phase: PitchPhase;
  /** Fractional MIDI note. */
  midi: number;
  note: string;
  octave: number;
  hz: number;
  cents: number;
  direction: PitchDirection;
  /** Vertical speed in semitones per second (positive = rising). */
  speed: number;
  velocity: number;
}

export interface PitchSnapshot {
  voices: PitchVoice[];
  /** The voice driving the big readout: fastest-moving or newest. */
  lead: PitchVoice | null;
  handsVisible: number;
}

export const EMPTY_PITCH_SNAPSHOT: PitchSnapshot = {
  voices: [],
  lead: null,
  handsVisible: 0,
};
