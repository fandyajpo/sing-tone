import type { CameraDevice } from "../../hooks/useCamera";

interface CameraSelectorProps {
  devices: CameraDevice[];
  deviceId: string | null;
  onSelect: (deviceId: string) => void;
}

export function CameraSelector({ devices, deviceId, onSelect }: CameraSelectorProps) {
  return (
    <div className="panel flex flex-col gap-1 px-3 py-2">
      <span className="text-[9px] uppercase tracking-[0.22em] text-ink-faint">Camera</span>
      <div className="select-shell w-[126px] sm:w-[150px]">
        <select
          value={deviceId ?? ""}
          onChange={(event) => onSelect(event.target.value)}
          aria-label="Camera source"
        >
          <option value="">Default camera</option>
          {devices.map((device, index) => (
            <option key={device.deviceId || `camera-${index}`} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </div>
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
        {devices.length > 1 ? `${devices.length} sources` : "local only"}
      </span>
    </div>
  );
}
