import { isPianoRangeId, PIANO_RANGES } from "../../lib/piano-ranges";
import type { PianoRange, PianoRangeId } from "../../lib/piano-ranges";
import { Select } from "../ui/Select";

interface PianoRangeSelectorProps {
  range: PianoRange;
  onChange: (rangeId: PianoRangeId) => void;
}

export function PianoRangeSelector({ range, onChange }: PianoRangeSelectorProps) {
  return (
    <div className="panel tone-lime px-2.5 py-2">
      <Select
        label="Note range"
        meta={range.label}
        value={range.id}
        options={PIANO_RANGES.map((option) => ({
          value: option.id,
          label: `${option.label}`,
          hint: `${option.lowest}–${option.highest}`,
        }))}
        onChange={(next) => {
          if (isPianoRangeId(next)) onChange(next);
        }}
        caption={`${range.character} Chords start at C${range.baseOctave}.`}
      />
    </div>
  );
}
