export type PlayMode = "chords" | "pitch";

const STORAGE_KEY = "sing-tone:play-mode";

export function readStoredMode(): PlayMode {
  if (typeof window === "undefined") return "chords";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "pitch" || stored === "chords") return stored;
  } catch {
    // Storage blocked: fall back to the chord instrument.
  }
  return "chords";
}

export function storeMode(mode: PlayMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Persistence is best-effort.
  }
}
