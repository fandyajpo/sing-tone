import type { CSSProperties } from "react";

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Text shown on the right of the label; defaults to a 0–100 readout. */
  display?: string;
  hint?: string;
}

/**
 * Range control with a filled track that follows the value. It stays a real
 * input[type=range] underneath so keyboard, wheel and touch all behave the way
 * people expect; only the skin is ours.
 */
export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  display,
  hint,
}: SliderProps) {
  const span = max - min || 1;
  const percent = Math.round(((value - min) / span) * 100);

  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-ink">{label}</span>
        <span className="font-mono text-[9px] tracking-[0.04em] text-ink-faint">
          {display ?? percent}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="range"
        style={{ "--fill": `${percent}%` } as CSSProperties}
        aria-label={label}
      />
      {hint && <span className="text-[10px] leading-snug text-ink-faint">{hint}</span>}
    </label>
  );
}
