import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { AudioEngine } from "../../lib/audio-engine";

interface LevelMeterProps {
  engineRef: RefObject<AudioEngine | null>;
  muted: boolean;
}

/**
 * Reads the audio analyser in its own animation loop and writes straight to the
 * DOM, so the level indicator never re-renders React.
 */
export function LevelMeter({ engineRef, muted }: LevelMeterProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const engine = engineRef.current;
      const level = engine ? engine.getLevel() : 0;
      const bar = barRef.current;
      if (bar) {
        bar.style.transform = `scaleX(${Math.min(1, Math.max(0, level))})`;
        bar.style.opacity = muted ? "0.25" : "1";
      }
      const readout = readoutRef.current;
      if (readout) {
        const db = level <= 0.004 ? -60 : 20 * Math.log10(level);
        readout.textContent = db <= -59 ? "−∞" : `${db.toFixed(0)}`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engineRef, muted]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-[0.22em] text-ink-faint">Level</span>
        <span className="font-mono text-[9px] text-ink-faint">
          <span ref={readoutRef}>−∞</span> dB
        </span>
      </div>
      <div className="relative h-[3px] w-16 overflow-hidden rounded-full bg-ink/10 sm:w-24">
        <div
          ref={barRef}
          className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-[#e8a565] via-[#c4553a] to-[#b83c5f]"
          style={{ transform: "scaleX(0)" }}
        />
      </div>
    </div>
  );
}
