import { Button } from "../ui/Button";

export type InitStageKey =
  | "preparing"
  | "permission"
  | "engine"
  | "model"
  | "calibrating"
  | "ready"
  | "error";

interface StageInfo {
  key: Exclude<InitStageKey, "error">;
  title: string;
  detail: string;
  progress: number;
}

/** Each entry is a phase the app really passes through, in order. */
const STAGES: readonly StageInfo[] = [
  {
    key: "preparing",
    title: "Preparing camera…",
    detail: "Setting up the video pipeline.",
    progress: 8,
  },
  {
    key: "permission",
    title: "Waiting for camera permission…",
    detail: "Allow camera access in the browser prompt to continue.",
    progress: 24,
  },
  {
    key: "engine",
    title: "Initializing hand tracking engine…",
    detail: "Starting the on-device vision runtime.",
    progress: 46,
  },
  {
    key: "model",
    title: "Loading AI vision model…",
    detail: "Fetching the 21-point hand model. Nothing leaves this device.",
    progress: 68,
  },
  {
    key: "calibrating",
    title: "Calibrating fingertip detection…",
    detail: "Reading the first frames so the tracker starts steady.",
    progress: 88,
  },
  {
    key: "ready",
    title: "Your instrument is ready.",
    detail: "Raise a hand and extend a finger.",
    progress: 100,
  },
];

interface InitializationScreenProps {
  stage: InitStageKey;
  error: string | null;
  onRetry: () => void;
}

export function InitializationScreen({ stage, error, onRetry }: InitializationScreenProps) {
  const errored = stage === "error";
  const currentIndex = errored ? -1 : STAGES.findIndex((entry) => entry.key === stage);
  const current = currentIndex >= 0 ? STAGES[currentIndex] : undefined;
  const progress = errored ? 100 : (current?.progress ?? 8);
  const title = errored ? "Hand tracking could not start" : (current?.title ?? "Preparing camera…");
  const detail = errored
    ? (error ?? "Something blocked the camera or the vision model.")
    : (current?.detail ?? "Setting up the video pipeline.");

  return (
    <div className="absolute inset-0 z-[58] grid place-items-center bg-paper/95 px-5 py-10">
      <div className="panel w-full max-w-md px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-[13px] tracking-[0.24em] text-ink">SING&nbsp;TONE</p>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold">
            {errored ? "stopped" : `${progress}%`}
          </span>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-[2px] border-2 border-edge bg-paper">
          <div
            className="h-full bg-gradient-to-r from-bronze to-gold transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p
          className={`mt-4 text-[12px] font-medium tracking-[0.04em] ${
            errored ? "text-ember" : "text-ink"
          }`}
          aria-live="polite"
        >
          {title}
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{detail}</p>

        {errored ? (
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="solid" block onClick={onRetry}>
              Try again
            </Button>
            <p className="text-[10px] leading-relaxed text-ink-faint">
              If it keeps failing: allow camera access for this site, close other apps using the
              webcam, check the connection for the vision model, then try again.
            </p>
          </div>
        ) : (
          <ol className="mt-4 flex flex-col gap-1.5">
            {STAGES.map((entry, index) => {
              const done = currentIndex > index;
              const active = currentIndex === index;
              return (
                <li
                  key={entry.key}
                  className={`flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] ${
                    active ? "text-gold" : done ? "text-ink-soft" : "text-ink-faint/60"
                  }`}
                >
                  <span
                    className={`grid h-3.5 w-3.5 place-items-center rounded-[2px] border-2 ${
                      done || active ? "border-gold" : "border-line/60"
                    }`}
                    aria-hidden="true"
                  >
                    {done ? "✓" : active ? "·" : ""}
                  </span>
                  {entry.key === "ready" ? "ready" : entry.title.replace("…", "")}
                </li>
              );
            })}
          </ol>
        )}

        {!errored && (
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
            camera stays on this device
          </p>
        )}
      </div>
    </div>
  );
}
