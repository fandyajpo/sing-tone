export type PitchClass =
  | "C"
  | "C#"
  | "D"
  | "D#"
  | "E"
  | "F"
  | "F#"
  | "G"
  | "G#"
  | "A"
  | "A#"
  | "B";

/** Scientific pitch notation, e.g. "C#3". */
export type PianoNote = `${PitchClass}${number}`;

export const PITCH_CLASSES: readonly PitchClass[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export type FingerPhase = "idle" | "enter" | "playing" | "released";

export interface NoteSplit {
  pitch: PitchClass;
  octave: string;
}

export function splitNote(note: PianoNote): NoteSplit {
  const pitch = note.slice(0, -1) as PitchClass;
  const octave = note.slice(-1);
  return { pitch, octave };
}

export function isPianoNote(value: string): value is PianoNote {
  return /^[A-G]#?[0-9]$/.test(value);
}

export function noteToMidi(note: PianoNote): number {
  const { pitch, octave } = splitNote(note);
  const index = PITCH_CLASSES.indexOf(pitch);
  if (index < 0) return 0;
  return (Number(octave) + 1) * 12 + index;
}

export function midiToNote(midi: number): PianoNote {
  const rounded = Math.round(midi);
  const pitch = PITCH_CLASSES[((rounded % 12) + 12) % 12] ?? "C";
  const octave = Math.floor(rounded / 12) - 1;
  return `${pitch}${octave}`;
}

/** Every chromatic note from `lowest` to `highest`, inclusive, ascending. */
export function buildNoteRange(lowest: PianoNote, highest: PianoNote): PianoNote[] {
  const start = noteToMidi(lowest);
  const end = noteToMidi(highest);
  const notes: PianoNote[] = [];
  for (let midi = start; midi <= end; midi += 1) {
    notes.push(midiToNote(midi));
  }
  return notes.length > 0 ? notes : [lowest];
}
