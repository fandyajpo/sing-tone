/**
 * The key to the camera overlay. A performer should never have to guess which
 * line is which hand or what a ring means, so the vocabulary is spelled out on
 * the stage: colour = hand, wireframe = tracked, ring = sounding, letters =
 * fingers.
 */
export function HandLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 hidden flex-col gap-1 rounded-[4px] border-2 border-edge bg-paper/88 px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-ink-soft shadow-[2px_2px_0_var(--color-edge)] backdrop-blur sm:flex">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-[1px] bg-cobalt" aria-hidden="true" />
          left
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-[1px] bg-coral" aria-hidden="true" />
          right
        </span>
        <span aria-hidden="true" className="text-ink-faint/60">
          ·
        </span>
        <span>wireframe = tracked</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full border-2 border-gold"
          />
          ring = sounding
        </span>
        <span aria-hidden="true" className="text-ink-faint/60">
          ·
        </span>
        <span>T I M R P = thumb → pinky</span>
      </div>
    </div>
  );
}
