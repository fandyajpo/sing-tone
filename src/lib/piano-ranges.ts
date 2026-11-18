import type { PianoNote } from "../types/piano";

export type PianoRangeId = "deep" | "low" | "medium" | "high" | "full";

export interface PianoRange {
  id: PianoRangeId;
  label: string;
  lowest: PianoNote;
  highest: PianoNote;
  character: string;
  suitableFor: string;
  /** Octave the gesture chords are built in before the right-thumb shift. */
  baseOctave: number;
}

/**
 * Central configuration for the playable note ranges. Everything else in the
 * app (mapping, labels, selector, persistence) derives from this table.
 */
export const PIANO_RANGE_MAP: Record<PianoRangeId, PianoRange> = {
  deep: {
    id: "deep",
    label: "Deep",
    lowest: "C2",
    highest: "B3",
    character: "Deep, warm, mellow, emotional.",
    suitableFor: "Deep melodies, ambient piano, emotional compositions.",
    baseOctave: 2,
  },
  low: {
    id: "low",
    label: "Low",
    lowest: "C3",
    highest: "B4",
    character: "Soft, warm, intimate.",
    suitableFor: "Sad songs, slow songs, romantic melodies.",
    baseOctave: 3,
  },
  medium: {
    id: "medium",
    label: "Medium",
    lowest: "C4",
    highest: "B5",
    character: "Balanced, natural, versatile.",
    suitableFor: "Pop songs and general piano playing.",
    baseOctave: 4,
  },
  high: {
    id: "high",
    label: "High",
    lowest: "C5",
    highest: "B6",
    character: "Bright, delicate, expressive.",
    suitableFor: "High melodies and lighter compositions.",
    baseOctave: 5,
  },
  full: {
    id: "full",
    label: "Full Range",
    lowest: "C2",
    highest: "B6",
    character: "Extended musical range.",
    suitableFor: "Experimental playing and wider musical exploration.",
    baseOctave: 3,
  },
};

export const PIANO_RANGES: readonly PianoRange[] = [
  PIANO_RANGE_MAP.deep,
  PIANO_RANGE_MAP.low,
  PIANO_RANGE_MAP.medium,
  PIANO_RANGE_MAP.high,
  PIANO_RANGE_MAP.full,
];

export const DEFAULT_PIANO_RANGE: PianoRangeId = "low";

export function getPianoRange(id: PianoRangeId): PianoRange {
  return PIANO_RANGE_MAP[id];
}

export function isPianoRangeId(value: string): value is PianoRangeId {
  return value === "deep" || value === "low" || value === "medium" || value === "high" || value === "full";
}

const STORAGE_KEY = "sing-tone:piano-range";

export function readStoredPianoRange(): PianoRangeId {
  if (typeof window === "undefined") return DEFAULT_PIANO_RANGE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isPianoRangeId(stored)) return stored;
  } catch {
    // Private mode or blocked storage: keep the default.
  }
  return DEFAULT_PIANO_RANGE;
}

export function storePianoRange(id: PianoRangeId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Persistence is best-effort; the session still works without it.
  }
}
