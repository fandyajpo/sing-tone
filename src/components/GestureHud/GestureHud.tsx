import { DEGREE_ROMANS, VOICING_LABELS, degreeRootLabels } from "../../lib/gesture-chords";
import type { ChordVoicing, KeyId } from "../../lib/gesture-chords";
import type { GestureSnapshot } from "../../hooks/useGestureSynth";

interface GestureHudProps {
  keyId: KeyId;
  snapshot: GestureSnapshot;
}

const VOICINGS: readonly ChordVoicing[] = ["root", "first", "seventh", "dominant"];

const MODE_LABELS = {
  diatonic: "natural",
  major: "major",
  minor: "minor",
} as const;

/**
 * The chord map from the reference instrument, rendered with the live key:
 * scale-degree roots on the left, voicings on the right, current chord centre.
 */
export function GestureHud({ keyId, snapshot }: GestureHudProps) {
  const roots = degreeRootLabels(keyId);
  const activeVoicing = snapshot.voicing;
  const degreeLabel = snapshot.degree === null ? "—" : (DEGREE_ROMANS[snapshot.degree] ?? "—");

  return (
    <div className="panel flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-stretch sm:gap-5 sm:px-5">
      <section className="min-w-0 sm:flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-ink">
            Left hand
          </span>
          <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-gold">
            {MODE_LABELS[snapshot.mode]}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {roots.map((root, index) => {
            const active = snapshot.degree === index;
            return (
              <span
                key={`${root}-${index}`}
                className={`min-w-[30px] rounded-lg border px-1.5 py-1 text-center font-mono text-[10px] tracking-wide transition-colors duration-150 ${
                  active
                    ? "border-gold/60 bg-gold/15 text-ink"
                    : "border-ink/10 bg-white/60 text-ink-soft"
                }`}
                title={`${DEGREE_ROMANS[index]} · ${MODE_LABELS[snapshot.mode]}`}
              >
                {root}
              </span>
            );
          })}
        </div>
        <p className="mt-1.5 text-[9px] leading-snug text-ink-faint">
          1–5 fingers · index + pinky = VI · + thumb = VII
        </p>
      </section>

      <section className="flex min-w-0 flex-col items-center justify-center border-y border-ink/10 py-2.5 sm:w-[200px] sm:border-x sm:border-y-0 sm:px-4 sm:py-0">
        <span className="text-[8px] uppercase tracking-[0.24em] text-ink-faint">Chord</span>
        <span className="mt-0.5 font-display text-2xl leading-none tracking-[0.04em] text-ink sm:text-[28px]">
          {snapshot.chordName ?? "—"}
        </span>
        <span className="mt-1.5 text-center font-mono text-[8px] uppercase tracking-[0.14em] text-ink-faint">
          {snapshot.chordName
            ? `${degreeLabel} · ${activeVoicing ? VOICING_LABELS[activeVoicing] : "root"}`
            : snapshot.leftPresent
              ? "hold a degree sign"
              : "show your left hand"}
        </span>
      </section>

      <section className="min-w-0 sm:flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-ink">
            Right hand
          </span>
          <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-gold">
            {snapshot.octaveShift > 0
              ? "8ve high"
              : snapshot.octaveShift < 0
                ? "8ve low"
                : "8ve base"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {VOICINGS.map((voicing) => {
            const active = activeVoicing === voicing;
            return (
              <span
                key={voicing}
                className={`rounded-lg border px-1.5 py-1 text-center font-mono text-[10px] tracking-wide transition-colors duration-150 ${
                  active
                    ? "border-gold/60 bg-gold/15 text-ink"
                    : "border-ink/10 bg-white/60 text-ink-soft"
                }`}
              >
                {VOICING_LABELS[voicing]}
              </span>
            );
          })}
          <span
            className={`ml-1 rounded-lg border px-1.5 py-1 font-mono text-[10px] tracking-wide ${
              snapshot.rightPresent
                ? "border-gold/40 bg-gold/[0.07] text-gold"
                : "border-ink/10 bg-white/60 text-ink-faint"
            }`}
          >
            {snapshot.rightPresent ? (snapshot.octaveShift < 0 ? "low" : "high") : "—"}
          </span>
        </div>
        <p className="mt-1.5 text-[9px] leading-snug text-ink-faint">
          1–4 fingers · thumb out = low octave, thumb in = high
        </p>
      </section>
    </div>
  );
}
