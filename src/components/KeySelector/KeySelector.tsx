import { getKey, KEYS } from "../../lib/gesture-chords";
import type { KeyId } from "../../lib/gesture-chords";
import { Select } from "../ui/Select";

interface KeySelectorProps {
  keyId: KeyId;
  onChange: (keyId: KeyId) => void;
}

export function KeySelector({ keyId, onChange }: KeySelectorProps) {
  const key = getKey(keyId);

  return (
    <div className="panel px-3 py-2.5">
      <Select
        label="Key"
        meta={`${key.label} major`}
        value={keyId}
        options={KEYS.map((option) => ({ value: option.id, label: option.label }))}
        onChange={onChange}
        caption="Left hand plays chords I–VII"
      />
    </div>
  );
}
