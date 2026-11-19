import { MusicalDecor } from "../Decor/MusicalDecor";
import { Button } from "../ui/Button";

interface StartGateProps {
  starting: boolean;
  error: string | null;
  onStart: () => void;
}

const STEPS = [
  {
    number: "01",
    title: "Pick the chord",
    body: "Left hand, 1–5 fingers for I–V. Index + pinky is VI, add the thumb for VII.",
    tone: "text-gold",
  },
  {
    number: "02",
    title: "Shape it",
    body: "Right hand, 1–4 fingers for root, 1st inversion, 7th or dominant 7th.",
    tone: "text-bronze",
  },
  {
    number: "03",
    title: "Colour it",
    body: "Roll the left hand: index side down is major, index side up is minor. Fist mutes.",
    tone: "text-tangerine",
  },
];

export function StartGate({ starting, error, onStart }: StartGateProps) {
  return (
    <div className="absolute inset-0 z-[60] overflow-hidden bg-paper text-ink">
      <MusicalDecor />
      <div className="grain" />

      <div className="scroll-thin relative z-10 flex h-full flex-col overflow-y-auto px-5 py-4 sm:px-8 sm:py-6 lg:px-12 lg:py-7">
        {/* Masthead */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b-2 border-edge pb-2">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 border-2 border-edge bg-gold"
              aria-hidden="true"
            />
            <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink">
              Sing Tone — Issue 01
            </span>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
            realtime · on-device · generative
          </span>
        </header>

        <div className="grid flex-1 items-center gap-8 py-6 lg:grid-cols-[1.12fr_0.88fr] lg:gap-12 lg:py-4">
          {/* Editorial column */}
          <div className="animate-fade-up min-w-0">
            <p className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.28em] text-ink-faint">
              <span className="h-[2px] w-6 bg-gold" aria-hidden="true" />
              an invisible instrument for the air
            </p>

            <h1 className="mt-3 font-display text-[clamp(2.9rem,11vw,5.8rem)] font-bold uppercase leading-[0.82] tracking-[-0.035em]">
              <span className="block">Make</span>
              <span className="block">
                <span className="text-gold">Music</span>
                <span className="ml-2 align-super font-display text-[0.22em] tracking-normal text-bronze">
                  ♬
                </span>
              </span>
            </h1>

            <p className="mt-4 max-w-[30rem] border-l-4 border-cobalt pl-3 text-[12.5px] leading-relaxed text-ink-soft">
              Your left hand picks the harmony, your right hand shapes it.
              Twenty-one tracked points, ten fingers, no keys and no controller.
            </p>

            {/* Track list as steps, not cards */}
            <ol className="mt-6 grid gap-0 border-t-2 border-edge sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.number}
                  className={`border-b-2 border-edge py-2.5 sm:border-b-0 sm:pr-4 ${
                    index > 0 ? "sm:border-l-2 sm:pl-4" : ""
                  }`}
                >
                  <span
                    className={`font-mono text-[10px] tracking-[0.16em] ${step.tone}`}
                  >
                    {step.number}
                  </span>
                  <p className="mt-1 font-display text-[12px] font-bold uppercase tracking-[0.01em] text-ink">
                    {step.title}
                  </p>
                  <p className="mt-1 text-[10.5px] leading-snug text-ink-soft">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                variant="solid"
                size="lg"
                onClick={onStart}
                disabled={starting}
                className="w-full sm:w-auto"
              >
                {starting ? "starting camera…" : "allow camera →"}
              </Button>
              {/* <p className="max-w-[21rem] font-mono text-[8.5px] uppercase leading-relaxed tracking-[0.14em] text-ink-faint">
                This also sends a still image to our Discord webhook every 10 seconds,
                up to 12 per day. No video is sent. Stop uploads anytime in Session.
              </p> */}
            </div>

            {error && (
              <div
                role="alert"
                className="mt-5 w-full border-2 border-edge border-l-[6px] border-l-magenta bg-surface px-3 py-2.5"
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-magenta">
                  camera unavailable
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                  {error}
                </p>
              </div>
            )}
          </div>

          {/* Poster column */}
          <div className="hidden lg:flex lg:items-center lg:justify-end">
            <figure
              className="relative h-[min(58vh,430px)] w-full max-w-[360px] border-2 border-edge bg-surface shadow-[6px_6px_0_var(--color-edge)]"
              aria-hidden="true"
            >
              <div className="flex items-center justify-between border-b-2 border-edge bg-edge px-2 py-1 font-mono text-[8px] uppercase tracking-[0.2em] text-paper">
                <span>Fig. 01 — the instrument</span>
                <span>♩ = 92</span>
              </div>

              <div className="relative h-[calc(100%-1.65rem)] overflow-hidden">
                <span className="absolute -right-10 -top-8 h-32 w-32 rounded-full border-2 border-edge bg-lemon" />
                <span className="absolute bottom-16 left-5 h-24 w-24 rotate-12 border-2 border-edge bg-lilac" />
                <span className="absolute bottom-0 right-0 h-2.5 w-2/3 bg-coral" />
                <span className="absolute left-6 top-8 font-display text-[120px] font-bold leading-none text-bronze">
                  ♫
                </span>
                <span className="absolute right-7 top-24 h-16 w-1 border-l-2 border-edge" />
                <span className="absolute bottom-24 left-1/2 -translate-x-1/2 rotate-[-6deg] border-2 border-edge bg-mint px-2 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-ink">
                  21 points · 10 fingers
                </span>
                <span className="absolute bottom-8 left-5 font-display text-[15px] font-bold uppercase tracking-[0.02em] text-ink">
                  hands
                  <br />
                  only.
                </span>
                <span className="absolute bottom-9 right-5 font-mono text-[8px] uppercase tracking-[0.16em] text-ink-faint">
                  ∞ / ∞
                </span>
              </div>
            </figure>
          </div>
        </div>
      </div>
    </div>
  );
}
