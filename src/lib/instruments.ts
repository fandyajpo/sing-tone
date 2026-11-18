import type { InstrumentId } from "../types/audio";

/**
 * Instrument definitions and voice configuration live here, separate from the
 * note-range presets in `piano-ranges.ts`. The audio engine reads these tables
 * rather than carrying its own copy of the sound design.
 */
export interface InstrumentMeta {
  id: InstrumentId;
  name: string;
  character: string;
  /** Short label used in tight UI spots. */
  tag: string;
}

export const INSTRUMENTS: readonly InstrumentMeta[] = [
  { id: "grand", name: "Grand Piano", character: "Felted, close-miked concert grand", tag: "SAMPLED" },
  { id: "electric", name: "Electric Piano", character: "Warm tine keys, late-night jazz", tag: "SAMPLED" },
  { id: "marimba", name: "Marimba", character: "Wooden bars, short decay", tag: "GENERATIVE" },
  { id: "warm", name: "Warm Synth", character: "Warm, mellow, soft, emotional", tag: "SYNTH" },
  { id: "bright", name: "Bright Synth", character: "Bright, crisp, clear, energetic", tag: "SYNTH" },
  { id: "retro", name: "Retro Synth", character: "Vintage analog-inspired tone", tag: "ANALOG" },
  { id: "synth", name: "Synth", character: "Wide detuned saws, slow bloom", tag: "GENERATIVE" },
];

export const INSTRUMENT_VOLUME_DB: Record<InstrumentId, number> = {
  grand: -1,
  electric: -3,
  marimba: -7,
  warm: -12,
  bright: -14,
  retro: -14,
  synth: -11,
};

export type SynthWaveform =
  | "triangle"
  | "sawtooth"
  | "square"
  | "fatsawtooth"
  | "fattriangle";

export interface SynthPatch {
  waveform: SynthWaveform;
  /** Voice count for the "fat" oscillator variants. */
  count?: number;
  spread?: number;
  envelope: { attack: number; decay: number; sustain: number; release: number };
  filter: { type: "lowpass" | "highpass" | "bandpass"; frequency: number; q: number };
}

export type AnalogSynthId = "warm" | "bright" | "retro";

/**
 * The three analog-style synths share one PolySynth voice builder; only these
 * patches differ. Oscillator, filter and envelope per instrument preserve the
 * individual character of each.
 */
export const SYNTH_PATCHES: Record<AnalogSynthId, SynthPatch> = {
  warm: {
    waveform: "fattriangle",
    count: 2,
    spread: 9,
    envelope: { attack: 0.06, decay: 0.7, sustain: 0.6, release: 1.9 },
    filter: { type: "lowpass", frequency: 1500, q: 0.7 },
  },
  bright: {
    waveform: "sawtooth",
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.32, release: 0.6 },
    filter: { type: "lowpass", frequency: 6200, q: 1.1 },
  },
  retro: {
    waveform: "fatsawtooth",
    count: 3,
    spread: 18,
    envelope: { attack: 0.012, decay: 0.4, sustain: 0.45, release: 1.1 },
    filter: { type: "lowpass", frequency: 2600, q: 2.2 },
  },
};

export function isAnalogSynthId(value: InstrumentId): value is AnalogSynthId {
  return value === "warm" || value === "bright" || value === "retro";
}

export function getInstrumentMeta(id: InstrumentId): InstrumentMeta {
  return INSTRUMENTS.find((entry) => entry.id === id) ?? INSTRUMENTS[0]!;
}

export const DEFAULT_INSTRUMENT: InstrumentId = "grand";

const STORAGE_KEY = "sing-tone:instrument";

export function isInstrumentId(value: string): value is InstrumentId {
  return INSTRUMENTS.some((entry) => entry.id === value);
}

export function readStoredInstrument(): InstrumentId {
  if (typeof window === "undefined") return DEFAULT_INSTRUMENT;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isInstrumentId(stored)) return stored;
  } catch {
    // Private mode or blocked storage: keep the default.
  }
  return DEFAULT_INSTRUMENT;
}

export function storeInstrument(id: InstrumentId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Persistence is best-effort; the session still works without it.
  }
}
