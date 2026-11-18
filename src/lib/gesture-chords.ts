import { midiToNote, type PianoNote } from "../types/piano";

/** Twelve selectable roots, matching the reference instrument's key list. */
export type KeyId = "A" | "Bb" | "B" | "C" | "Db" | "D" | "Eb" | "E" | "F" | "Gb" | "G" | "Ab";

export interface MusicalKey {
  id: KeyId;
  /** Display label, e.g. "A#/Bb". */
  label: string;
  pitchClass: number;
}

export const KEYS: readonly MusicalKey[] = [
  { id: "A", label: "A", pitchClass: 9 },
  { id: "Bb", label: "A#/Bb", pitchClass: 10 },
  { id: "B", label: "B", pitchClass: 11 },
  { id: "C", label: "C", pitchClass: 0 },
  { id: "Db", label: "C#/Db", pitchClass: 1 },
  { id: "D", label: "D", pitchClass: 2 },
  { id: "Eb", label: "D#/Eb", pitchClass: 3 },
  { id: "E", label: "E", pitchClass: 4 },
  { id: "F", label: "F", pitchClass: 5 },
  { id: "Gb", label: "F#/Gb", pitchClass: 6 },
  { id: "G", label: "G", pitchClass: 7 },
  { id: "Ab", label: "G#/Ab", pitchClass: 8 },
];

export const DEFAULT_KEY: KeyId = "A";

export function getKey(id: KeyId): MusicalKey {
  return KEYS.find((key) => key.id === id) ?? KEYS[0]!;
}

export function isKeyId(value: string): value is KeyId {
  return KEYS.some((key) => key.id === value);
}

/** Major-scale semitone offsets for degrees I..VII. */
export const DEGREE_SEMITONES: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

export const DEGREE_ROMANS: readonly string[] = ["I", "II", "III", "IV", "V", "VI", "VII"];

export type TriadQuality = "major" | "minor" | "diminished";

/** Natural quality of each degree in a major key. */
export const DEGREE_QUALITIES: readonly TriadQuality[] = [
  "major",
  "minor",
  "minor",
  "major",
  "major",
  "minor",
  "diminished",
];

export type ChordMode = "diatonic" | "major" | "minor";
export type ChordVoicing = "root" | "first" | "seventh" | "dominant";

export const VOICING_LABELS: Record<ChordVoicing, string> = {
  root: "Root",
  first: "1st",
  seventh: "Maj 7",
  dominant: "Dom 7",
};

export interface ChordSpec {
  keyId: KeyId;
  /** 0..6 for degrees I..VII. */
  degree: number;
  mode: ChordMode;
  voicing: ChordVoicing;
  baseOctave: number;
  octaveShift: number;
}

export interface Chord {
  id: string;
  name: string;
  notes: PianoNote[];
  rootLabel: string;
  degree: number;
  quality: TriadQuality;
  voicing: ChordVoicing;
}

function clampDegree(degree: number): number {
  return Math.max(0, Math.min(DEGREE_ROMANS.length - 1, Math.round(degree)));
}

export function pitchLabel(midi: number): string {
  const note = midiToNote(midi);
  return note.slice(0, -1);
}

/** Note names for every degree of the key, used by the gesture HUD. */
export function degreeRootLabels(keyId: KeyId): string[] {
  const key = getKey(keyId);
  return DEGREE_SEMITONES.map((semitone) => pitchLabel(48 + key.pitchClass + semitone));
}

export function degreeRootLabel(keyId: KeyId, degree: number): string {
  return degreeRootLabels(keyId)[clampDegree(degree)] ?? "C";
}

function qualityOf(degree: number, mode: ChordMode): TriadQuality {
  if (mode === "major") return "major";
  if (mode === "minor") return "minor";
  return DEGREE_QUALITIES[degree] ?? "major";
}

function suffixFor(quality: TriadQuality, voicing: ChordVoicing): string {
  if (voicing === "seventh") {
    return quality === "major" ? "maj7" : quality === "minor" ? "m7" : "dim7";
  }
  if (voicing === "dominant") {
    return quality === "diminished" ? "dim7" : "7";
  }
  return quality === "major" ? "" : quality === "minor" ? "m" : "dim";
}

/**
 * Builds the chord for a gesture combination. The degree sets the root inside
 * the selected key, the mode overrides the diatonic quality (or keeps it), the
 * voicing picks root position / first inversion / 7th, and the octave shift
 * comes from the right thumb.
 */
export function chordFor(spec: ChordSpec): Chord {
  const key = getKey(spec.keyId);
  const degree = clampDegree(spec.degree);
  const quality = qualityOf(degree, spec.mode);
  const rootPitchClass = (key.pitchClass + (DEGREE_SEMITONES[degree] ?? 0)) % 12;
  const octave = Math.max(0, spec.baseOctave + spec.octaveShift);
  const rootMidi = (octave + 1) * 12 + rootPitchClass;

  const third = quality === "major" ? 4 : 3;
  const fifth = quality === "diminished" ? 6 : 7;
  const seventh = quality === "major" ? 11 : quality === "minor" ? 10 : 9;

  let midis: number[];
  switch (spec.voicing) {
    case "first":
      midis = [rootMidi + third, rootMidi + fifth, rootMidi + 12];
      break;
    case "seventh":
      midis = [rootMidi, rootMidi + third, rootMidi + fifth, rootMidi + seventh];
      break;
    case "dominant":
      midis = [
        rootMidi,
        rootMidi + third,
        rootMidi + fifth,
        rootMidi + (quality === "diminished" ? 9 : 10),
      ];
      break;
    case "root":
    default:
      midis = [rootMidi, rootMidi + third, rootMidi + fifth];
      break;
  }

  const rootLabel = pitchLabel(rootMidi);
  const suffix = suffixFor(quality, spec.voicing);
  const bassLabel = spec.voicing === "first" ? pitchLabel(midis[0] ?? rootMidi) : null;

  return {
    id: `${spec.keyId}:${degree}:${spec.mode}:${spec.voicing}:${octave}`,
    name: `${rootLabel}${suffix}${bassLabel ? `/${bassLabel}` : ""}`,
    notes: midis.map((midi) => midiToNote(midi)),
    rootLabel,
    degree,
    quality,
    voicing: spec.voicing,
  };
}

const STORAGE_KEY = "sing-tone:key";

export function readStoredKey(): KeyId {
  if (typeof window === "undefined") return DEFAULT_KEY;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isKeyId(stored)) return stored;
  } catch {
    // Storage can be blocked; keep the default.
  }
  return DEFAULT_KEY;
}

export function storeKey(id: KeyId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Best effort only.
  }
}
