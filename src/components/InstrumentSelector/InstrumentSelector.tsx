import { getInstrumentMeta, INSTRUMENTS } from "../../lib/instruments";
import type { InstrumentId } from "../../types/audio";

interface InstrumentSelectorProps {
  instrument: InstrumentId;
  onSelect: (instrument: InstrumentId) => void;
}

export function InstrumentSelector({ instrument, onSelect }: InstrumentSelectorProps) {
  const meta = getInstrumentMeta(instrument);

  return (
    <div className="panel flex flex-col gap-1 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-[0.22em] text-ink-faint">Instrument</span>
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-gold/80">
          {meta.tag}
        </span>
      </div>
      <div className="select-shell w-[126px] sm:w-[140px]">
        <select
          value={instrument}
          onChange={(event) => onSelect(event.target.value as InstrumentId)}
          aria-label="Instrument"
        >
          {INSTRUMENTS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>
      <span className="max-w-[148px] text-[10px] leading-tight text-ink-faint">
        {meta.character}
      </span>
    </div>
  );
}
