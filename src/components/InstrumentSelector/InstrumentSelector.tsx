import { getInstrumentMeta, INSTRUMENTS } from "../../lib/instruments";
import type { InstrumentId } from "../../types/audio";
import { Select } from "../ui/Select";

interface InstrumentSelectorProps {
  instrument: InstrumentId;
  onSelect: (instrument: InstrumentId) => void;
}

export function InstrumentSelector({ instrument, onSelect }: InstrumentSelectorProps) {
  const meta = getInstrumentMeta(instrument);

  return (
    <div className="panel tone-cobalt px-2.5 py-2">
      <Select
        label="Instrument"
        meta={meta.tag}
        value={instrument}
        options={INSTRUMENTS.map((entry) => ({ value: entry.id, label: entry.name }))}
        onChange={onSelect}
        caption={meta.character}
      />
    </div>
  );
}
