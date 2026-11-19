import { useEffect } from "react";
import { INSTRUMENTS } from "../../lib/instruments";
import { PIANO_RANGES } from "../../lib/piano-ranges";
import { midiToNote } from "../../types/piano";
import { Button } from "../ui/Button";
import { Slider } from "../ui/Slider";

export interface PerformanceSettings {
  sensitivity: number;
  smoothing: number;
  detectionConfidence: number;
  pitchBendRange: number;
  pitchLowMidi: number;
  pitchHighMidi: number;
  pitchResponseMs: number;
  pitchDeadZone: number;
}

interface GuidePanelProps {
  open: boolean;
  onClose: () => void;
  settings: PerformanceSettings;
  onChange: (patch: Partial<PerformanceSettings>) => void;
  rangeLowMidi: number;
  rangeHighMidi: number;
  audioReady: boolean;
  audioError: string | null;
  onEnableAudio: () => void;
  trackingError: string | null;
}

const LEFT_HAND = [
  { sign: "1 finger", result: "I" },
  { sign: "2 fingers", result: "II" },
  { sign: "3 fingers", result: "III" },
  { sign: "4 fingers", result: "IV" },
  { sign: "5 fingers", result: "V" },
  { sign: "index + pinky", result: "VI" },
  { sign: "index + pinky + thumb", result: "VII" },
  { sign: "fist", result: "mute" },
];

const RIGHT_HAND = [
  { sign: "1 finger", result: "root position" },
  { sign: "2 fingers", result: "1st inversion" },
  { sign: "3 fingers", result: "7th / min 7" },
  { sign: "4 fingers", result: "dom 7 / dim 7" },
  { sign: "thumb out", result: "octave down" },
  { sign: "thumb in", result: "octave up" },
  { sign: "hand higher", result: "louder" },
  { sign: "hand lower", result: "softer" },
];

const STEPS = [
  {
    title: "Pick a key",
    body: "The chord roots follow the key: in A major the seven degrees are A, B, C#, D, E, F# and G#. Change the key and every sign moves with it.",
  },
  {
    title: "Left hand = harmony",
    body: "Hold up one to five fingers for degrees I–V. Index and pinky together is VI; add the thumb for VII. A fist mutes the chord without moving your right hand.",
  },
  {
    title: "Roll for major or minor",
    body: "Knuckles level keeps the natural chord of the scale. Drop the index side for major, lift it for minor. There is a dead zone, so a steady hand never flickers.",
  },
  {
    title: "Right hand = voicing",
    body: "One finger for root position, two for the first inversion, three for a seventh, four for a dominant seventh. Thumb out drops an octave, thumb in raises it.",
  },
  {
    title: "Octave comes from the range",
    body: "The note range sets the register your chords are built in, and the right thumb shifts it one octave either way.",
  },
  {
    title: "Let the chord settle",
    body: "A new sign has to hold for about a tenth of a second before it replaces the sounding chord, so stray fingers never retrigger.",
  },
];

export function GuidePanel({
  open,
  onClose,
  settings,
  onChange,
  rangeLowMidi,
  rangeHighMidi,
  audioReady,
  audioError,
  onEnableAudio,
  trackingError,
}: GuidePanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close guide"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 cursor-default bg-paper/75 backdrop-blur-md"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        className="panel scroll-thin animate-fade-up relative z-10 max-h-[88dvh] w-full max-w-3xl overflow-y-auto"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line/70 bg-paper-soft/95 px-5 py-4 backdrop-blur-xl sm:px-7">
          <div>
            <p className="text-[8px] uppercase tracking-[0.4em] text-gold/80">Sing Tone</p>
            <h2 id="guide-title" className="mt-1.5 text-lg font-light tracking-[0.16em] text-ink">
              GUIDE
            </h2>
          </div>
          <Button
            onClick={onClose}
            aria-label="Close guide"
            className="!h-8 !w-8 !rounded-[4px] !p-0"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </Button>
        </header>

        <div className="grid gap-7 p-5 sm:grid-cols-[1.15fr_1fr] sm:p-7">
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-2">
              <GestureTable title="Left hand" rows={LEFT_HAND} />
              <GestureTable title="Right hand" rows={RIGHT_HAND} />
            </div>

            <ol className="flex flex-col gap-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 font-mono text-[9px] tracking-[0.14em] text-gold/80">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-[12px] font-medium tracking-[0.06em] text-ink">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col gap-5">
            <section className="rounded-[5px] border border-line bg-surface/60 p-4">
              <h3 className="text-[9px] uppercase tracking-[0.3em] text-ink-soft">Calibration</h3>

              <div className="mt-4 flex flex-col gap-4">
                <Slider
                  label="Sensitivity"
                  hint="How easily a finger counts as extended"
                  value={settings.sensitivity}
                  display={`${Math.round(settings.sensitivity * 100)}`}
                  onChange={(value) => onChange({ sensitivity: value })}
                />
                <Slider
                  label="Smoothing"
                  hint="Calms jittery landmarks"
                  value={settings.smoothing}
                  display={`${Math.round(settings.smoothing * 100)}`}
                  onChange={(value) => onChange({ smoothing: value })}
                />
                <Slider
                  label="Detection"
                  hint="Hand detection confidence"
                  value={settings.detectionConfidence}
                  min={0.3}
                  max={0.85}
                  display={`${Math.round(settings.detectionConfidence * 100)}`}
                  onChange={(value) => onChange({ detectionConfidence: value })}
                />
              </div>
            </section>

            <section className="rounded-[5px] border border-line bg-surface/60 p-4">
              <h3 className="text-[9px] uppercase tracking-[0.3em] text-ink-soft">Pitch glide</h3>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
                In pitch mode each extended fingertip holds its own continuous voice. Its height in
                the frame sets the pitch, inside the window below.
              </p>

              <div className="mt-4 flex flex-col gap-4">
                <Slider
                  label="Bend range"
                  min={12}
                  max={Math.max(12, rangeHighMidi - rangeLowMidi)}
                  step={1}
                  value={settings.pitchBendRange}
                  display={`${settings.pitchBendRange} st`}
                  hint="Semitones covered by the full vertical travel"
                  onChange={(value) => onChange({ pitchBendRange: value })}
                />
                <Slider
                  label="Lowest pitch"
                  min={rangeLowMidi}
                  max={settings.pitchHighMidi - 12}
                  step={1}
                  value={settings.pitchLowMidi}
                  display={midiToNote(settings.pitchLowMidi)}
                  onChange={(value) => onChange({ pitchLowMidi: value })}
                />
                <Slider
                  label="Highest pitch"
                  min={settings.pitchLowMidi + 12}
                  max={rangeHighMidi}
                  step={1}
                  value={settings.pitchHighMidi}
                  display={midiToNote(settings.pitchHighMidi)}
                  onChange={(value) => onChange({ pitchHighMidi: value })}
                />
                <Slider
                  label="Response"
                  min={30}
                  max={240}
                  step={5}
                  value={settings.pitchResponseMs}
                  display={`${settings.pitchResponseMs} ms`}
                  hint="How quickly the pitch follows the finger"
                  onChange={(value) => onChange({ pitchResponseMs: value })}
                />
                <Slider
                  label="Dead zone"
                  min={0}
                  max={0.02}
                  step={0.0005}
                  value={settings.pitchDeadZone}
                  display={`${(settings.pitchDeadZone * 100).toFixed(1)}%`}
                  hint="Ignores tiny jitter while a finger is held"
                  onChange={(value) => onChange({ pitchDeadZone: value })}
                />
              </div>
            </section>

            <section className="rounded-[5px] border border-line bg-surface/60 p-4">
              <h3 className="text-[9px] uppercase tracking-[0.3em] text-ink-soft">Sound</h3>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
                Grand and electric piano are sampled; marimba and the synth family — Warm, Bright,
                Retro and Synth — are generated live. If the samples cannot load, a synthesized
                piano takes over automatically.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {INSTRUMENTS.map((instrument) => (
                  <span
                    key={instrument.id}
                    className="rounded-[3px] border border-line px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.16em] text-ink-faint"
                  >
                    {instrument.name}
                  </span>
                ))}
              </div>

              {!audioReady && (
                <Button variant="gold" size="sm" block className="mt-4" onClick={onEnableAudio}>
                  Enable audio
                </Button>
              )}
              {audioError && <p className="mt-2 text-[10px] text-magenta">{audioError}</p>}
            </section>

            <section className="rounded-[5px] border border-line bg-surface/60 p-4">
              <h3 className="text-[9px] uppercase tracking-[0.3em] text-ink-soft">Register</h3>
              <ul className="mt-2.5 flex flex-col gap-2">
                {PIANO_RANGES.map((preset) => (
                  <li key={preset.id} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-ink">{preset.label}</p>
                      <p className="text-[10px] leading-snug text-ink-faint">
                        chords from C{preset.baseOctave}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[9px] text-gold/80">
                      {preset.lowest}–{preset.highest}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[10px] leading-relaxed text-ink-faint">
                Switching the register releases the sounding chord, then rebuilds it in the new
                octave. The choice is remembered on this device.
              </p>
            </section>

            <section className="rounded-[5px] border border-line bg-surface/60 p-4">
              <h3 className="text-[9px] uppercase tracking-[0.3em] text-ink-soft">
                Better detection
              </h3>
              <ul className="mt-2.5 flex flex-col gap-1.5 text-[11px] leading-relaxed text-ink-soft">
                <li>· Face a window or lamp — avoid backlight.</li>
                <li>· Plain backgrounds track more reliably.</li>
                <li>· Keep both hands inside the frame at all times.</li>
                <li>· Hold a sign still for a moment before changing it.</li>
                <li>· If a hand is lost, lower your detection confidence.</li>
              </ul>
              {trackingError && <p className="mt-2 text-[10px] text-magenta">{trackingError}</p>}
            </section>

            <p className="text-[10px] leading-relaxed text-ink-faint">
              Nothing is uploaded. Camera frames are processed by a hand landmark model running
              locally in this tab.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GestureTable({
  title,
  rows,
}: {
  title: string;
  rows: readonly { sign: string; result: string }[];
}) {
  return (
    <div className="rounded-[5px] border border-line bg-surface/60 p-3">
      <h3 className="text-[8px] uppercase tracking-[0.3em] text-ink-faint">{title}</h3>
      <dl className="mt-2 flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.sign} className="flex items-baseline justify-between gap-2">
            <dt className="text-[10px] text-ink-soft">{row.sign}</dt>
            <dd className="font-mono text-[9px] uppercase tracking-[0.08em] text-gold">
              {row.result}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}


