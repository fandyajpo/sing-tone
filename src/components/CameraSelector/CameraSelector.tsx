import type { CameraDevice } from "../../hooks/useCamera";
import { Select } from "../ui/Select";

interface CameraSelectorProps {
  devices: CameraDevice[];
  deviceId: string | null;
  onSelect: (deviceId: string) => void;
}

export function CameraSelector({ devices, deviceId, onSelect }: CameraSelectorProps) {
  return (
    <div className="panel px-3 py-2.5">
      <Select
        label="Camera"
        meta={devices.length > 1 ? `${devices.length} sources` : "local only"}
        value={deviceId ?? ""}
        options={[
          { value: "", label: "Default camera" },
          ...devices.map((device, index) => ({
            value: device.deviceId,
            label: device.label || `Camera ${index + 1}`,
          })),
        ]}
        onChange={onSelect}
        caption="Video never leaves this tab"
      />
    </div>
  );
}
