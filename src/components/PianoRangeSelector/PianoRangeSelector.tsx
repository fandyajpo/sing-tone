import { isPianoRangeId, PIANO_RANGES } from "../../lib/piano-ranges";
import type { PianoRange, PianoRangeId } from "../../lib/piano-ranges";

interface PianoRangeSelectorProps {
  range: PianoRange;
  onChange: (rangeId: PianoRangeId) => void;
}

export function PianoRangeSelector({ range, onChange }: PianoRangeSelectorProps) {
  return (
    <div
      className="panel flex flex-col gap-1 px-3 py-2"
      title={`${range.character} ${range.suitableFor}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-[0.22em] text-ink-faint">Note range</span>
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-gold/80">
          {range.label}
        </span>
      </div>

      <div className="select-shell w-[150px] sm:w-[172px]">
        <select
          value={range.id}
          onChange={(event) => {
            const next = event.target.value;
            if (isPianoRangeId(next)) onChange(next);
          }}
          aria-label="Note range"
        >
          {PIANO_RANGES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} ({option.lowest}–{option.highest})
            </option>
          ))}
        </select>
      </div>

      <span className="font-mono text-[10px] tracking-[0.03em] text-gold">
        {range.lowest} – {range.highest}
      </span>
      <span className="max-w-[148px] text-[10px] leading-tight text-ink-faint">
        {range.character}
      </span>
    </div>
  );
}
