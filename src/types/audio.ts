export type InstrumentId =
  | "grand"
  | "electric"
  | "marimba"
  | "warm"
  | "bright"
  | "retro"
  | "synth";

export type AudioStatus = "idle" | "loading" | "ready" | "error";

export interface AudioSettings {
  volume: number;
  muted: boolean;
  instrument: InstrumentId;
}
