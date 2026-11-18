import { getKey, KEYS } from "../../lib/gesture-chords";
import type { KeyId } from "../../lib/gesture-chords";

interface KeySelectorProps {
  keyId: KeyId;
  onChange: (keyId: KeyId) => void;
}

export function KeySelector({ keyId, onChange }: KeySelectorProps) {
  const key = getKey(keyId);

  return (
    <div className="panel flex flex-col gap-1 px-3 py-2" title={`Chords are built in ${key.label} major`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-[0.22em] text-ink-faint">Key</span>
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-gold/80">
          {key.label}
        </span>
      </div>

      <div className="select-shell w-[92px]">
        <select
          value={keyId}
          onChange={(event) => onChange(event.target.value as KeyId)}
          aria-label="Key"
        >
          {KEYS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <span className="font-mono text-[10px] tracking-[0.03em] text-gold">
        {key.label} major
      </span>
      <span className="max-w-[112px] text-[10px] leading-tight text-ink-faint">
        Left hand plays chords I–VII
      </span>
    </div>
  );
}
