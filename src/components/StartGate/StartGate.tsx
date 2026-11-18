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
  },
  {
    number: "02",
    title: "Shape it",
    body: "Right hand, 1–4 fingers for root, 1st inversion, 7th or dominant 7th.",
  },
  {
    number: "03",
    title: "Colour it",
    body: "Roll the left hand: index side down is major, index side up is minor. Fist mutes.",
  },
];

export function StartGate({ starting, error, onStart }: StartGateProps) {
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center overflow-hidden bg-paper px-5 py-8 text-ink">
      <div className="pointer-events-none absolute left-1/2 top-[30%] h-[82vmin] w-[82vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(232,165,101,0.35),rgba(232,165,101,0.08)_50%,transparent_72%)] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-[-10%] h-[60vmin] w-[60vmin] rounded-full bg-[radial-gradient(circle,rgba(184,60,95,0.12),transparent_65%)] blur-3xl" />
      <div className="grain" />

      <div className="animate-fade-up relative z-10 flex w-full max-w-lg flex-col items-center text-center">
        <span className="mb-6 flex items-center gap-2 rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-[8px] uppercase tracking-[0.36em] text-ink-soft">
          <span className="breathe h-1 w-1 rounded-full bg-gold" />
          real-time · on-device · generative
        </span>

        <h1 className="font-display text-[clamp(2.2rem,8vw,3.6rem)] font-normal leading-none tracking-[0.24em] text-ink">
          SING&nbsp;TONE
        </h1>

        <p className="mt-5 max-w-sm text-[13px] leading-relaxed text-ink-soft">
          An invisible chord instrument. Your left hand picks the harmony, your right hand shapes
          it — no keys, no mouse, no controller.
        </p>

        <div className="mt-8 grid w-full gap-2 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="rounded-2xl border border-ink/10 bg-white/75 px-3 py-3 text-left"
            >
              <span className="font-mono text-[9px] tracking-[0.2em] text-gold/80">
                {step.number}
              </span>
              <p className="mt-1 text-[11px] font-medium tracking-[0.04em] text-ink">
                {step.title}
              </p>
              <p className="mt-1 text-[10.5px] leading-snug text-ink-soft">{step.body}</p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="group relative mt-8 w-full overflow-hidden rounded-full bg-ink px-8 py-3.5 text-[10px] uppercase tracking-[0.32em] text-[#fdf9f2] transition-colors duration-200 hover:bg-[#3a3126] disabled:cursor-wait disabled:opacity-60"
        >
          <span className="relative z-10">
            {starting ? "starting camera…" : "enter the instrument"}
          </span>
        </button>

        <p className="mt-4 text-[10.5px] leading-relaxed text-ink-faint">
          Your browser will ask for camera access. Sound starts with the same tap.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-5 w-full rounded-2xl border border-magenta/25 bg-magenta/[0.06] px-4 py-3 text-left"
          >
            <p className="text-[9px] uppercase tracking-[0.24em] text-magenta">camera unavailable</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{error}</p>
          </div>
        )}

        <p className="mt-7 flex items-center gap-2 text-[9px] uppercase tracking-[0.24em] text-ink-faint">
          <LockIcon />
          video never leaves this device
        </p>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="9" height="10" viewBox="0 0 9 10" fill="none" aria-hidden="true">
      <rect x="1" y="4" width="7" height="5" rx="1.2" stroke="currentColor" strokeWidth="1" />
      <path d="M2.6 4V2.8a1.9 1.9 0 0 1 3.8 0V4" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
