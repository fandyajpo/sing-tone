import type { PitchWindow } from "../../lib/pitch-mapping";
import { STILL_SPEED } from "../../lib/pitch-state";
import type { PitchSnapshot, PitchVoice } from "../../types/pitch";

interface PitchMeterProps {
  window: PitchWindow;
  snapshot: PitchSnapshot;
}

const DIRECTION_GLYPH = { 1: "↑", 0: "·", [-1]: "↓" } as const;

/**
 * A pitch readout in the spirit of a rev counter: one tall scale, a travelling
 * indicator, and the live note beside it. It reads movement rather than RPM, so
 * the same layout still makes sense to a musician.
 */
export function PitchMeter({ window, snapshot }: PitchMeterProps) {
  const lead = snapshot.lead;
  const span = Math.max(1, window.high - window.low);
  const position = lead ? clamp01((lead.midi - window.low) / span) : 0;
  const moving = Math.abs(lead?.speed ?? 0) > 0.35;
  const noteName = lead?.note ?? "—";
  const octave = lead?.octave;
  const hz = lead?.hz ?? 0;
  const direction = lead?.direction ?? 0;
  const speed = Math.abs(lead?.speed ?? 0);

  return (
    <div className="panel tone-coral flex flex-col gap-2 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[9px] uppercase tracking-[0.24em] text-ink-faint">Pitch</p>
          <p className="mt-0.5 text-[10px] leading-snug text-ink-soft">
            Move a fingertip up or down
          </p>
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-gold/80">
          {window.low}–{window.high} midi
        </span>
      </div>

      <div className="flex items-stretch gap-3">
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink-faint">
            {snapshot.voices.length > 0 ? "sounding" : "silent"}
          </span>
          <span
            className="mt-1 font-display text-[34px] font-bold leading-none tracking-[-0.02em] text-ink transition-[text-shadow] duration-150"
            style={{ textShadow: moving ? "0 0 18px rgba(214, 164, 93, 0.3)" : "none" }}
          >
            {noteName}
            {octave !== undefined && (
              <span className="ml-1 align-top font-mono text-[10px] text-ink-faint">{octave}</span>
            )}
          </span>
          <span className="mt-1 font-mono text-[10px] text-ink-faint">
            {hz > 0 ? `${hz.toFixed(1)} Hz` : "— Hz"}
            {lead && (
              <span className="ml-2 text-ink-soft">{describe(lead)}</span>
            )}
          </span>
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={`grid h-5 w-5 place-items-center rounded-[3px] border-2 border-edge text-[11px] leading-none shadow-[2px_2px_0_var(--color-edge)] transition-colors duration-150 ${
                direction === 0
                  ? "bg-paper-soft text-ink-faint"
                  : "bg-gold text-ink"
              }`}
              aria-hidden="true"
            >
              {DIRECTION_GLYPH[direction]}
            </span>
            <div className="relative h-[3px] flex-1 overflow-hidden rounded-[2px] bg-line/60">
              <div
                className="absolute inset-y-0 left-0 rounded-[2px] bg-gradient-to-r from-bronze to-gold transition-[width] duration-100"
                style={{ width: `${Math.min(100, (speed / 12) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="relative w-9 shrink-0">
          <div className="absolute inset-0 overflow-hidden rounded-[4px] border-2 border-edge bg-paper/80">
            <div
              className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bronze/35 via-gold/12 to-transparent transition-[height] duration-100"
              style={{ height: `${position * 100}%` }}
            />
            {ticksFor(window).map((tick) => (
              <span
                key={tick.midi}
                className="absolute left-0 h-px bg-line/70"
                style={{ bottom: `${tick.position * 100}%`, width: tick.octave ? "9px" : "5px" }}
              />
            ))}
            <div
              className="absolute left-1/2 h-[2px] w-[26px] -translate-x-1/2 rounded-[1px] bg-gold transition-[bottom,box-shadow] duration-100"
              style={{
                bottom: `calc(${position * 100}% - 1px)`,
                boxShadow: moving ? "0 0 10px rgba(214, 164, 93, 0.45)" : "none",
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {snapshot.voices.length === 0 ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
            no fingers held
          </span>
        ) : (
          snapshot.voices.map((voice) => <VoiceChip key={voice.key} voice={voice} />)
        )}
      </div>
    </div>
  );
}

const MOVE_GLYPH = { up: "↑", down: "↓", horizontal: "↔", stationary: "·" } as const;

function describe(voice: PitchVoice): string {
  const move = voice.movement === "stationary" ? "held" : voice.movement;
  const pace =
    Math.abs(voice.speed) > 8
      ? "fast"
      : Math.abs(voice.speed) > STILL_SPEED
        ? "slow"
        : "steady";
  return `${move} ${MOVE_GLYPH[voice.movement]} · ${pace}`;
}

function VoiceChip({ voice }: { voice: PitchVoice }) {
  const active = voice.phase === "bending";
  return (
    <span
      className={`flex items-center gap-1 rounded-[3px] border-2 border-edge px-1.5 py-0.5 font-mono text-[9px] tracking-[0.06em] shadow-[2px_2px_0_var(--color-edge)] transition-all duration-150 ${
        active ? "bg-gold text-ink" : "bg-paper-soft text-ink-soft"
      }`}
      title={`${voice.hand} ${voice.finger} · ${voice.hz.toFixed(1)} Hz`}
    >
      <span
        className={`h-1 w-1 rounded-[1px] ${active ? "bg-gold" : "bg-line"}`}
        aria-hidden="true"
      />
      {voice.note}
      {voice.octave}
      <span className="text-[8px] text-ink-faint">{MOVE_GLYPH[voice.movement]}</span>
    </span>
  );
}

function ticksFor(window: PitchWindow): { midi: number; position: number; octave: number }[] {
  const span = Math.max(1, window.high - window.low);
  const ticks: { midi: number; position: number; octave: number }[] = [];
  for (let midi = Math.ceil(window.low / 12) * 12; midi <= window.high; midi += 12) {
    ticks.push({ midi, position: clamp01((midi - window.low) / span), octave: midi % 12 === 0 ? 1 : 0 });
  }
  return ticks;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
