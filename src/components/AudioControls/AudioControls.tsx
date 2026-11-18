import type { RefObject } from "react";
import type { AudioEngine } from "../../lib/audio-engine";
import type { AudioStatus } from "../../types/audio";
import { LevelMeter } from "./LevelMeter";

interface AudioControlsProps {
  status: AudioStatus;
  volume: number;
  muted: boolean;
  usingFallback: boolean;
  engineRef: RefObject<AudioEngine | null>;
  onVolumeChange: (value: number) => void;
  onToggleMute: () => void;
  onEnableAudio: () => void;
}

export function AudioControls({
  status,
  volume,
  muted,
  usingFallback,
  engineRef,
  onVolumeChange,
  onToggleMute,
  onEnableAudio,
}: AudioControlsProps) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="panel flex items-center gap-3 px-3 py-2">
        <LevelMeter engineRef={engineRef} muted={muted} />

        <div className="h-5 w-px bg-ink/10" />

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute audio" : "Mute audio"}
            aria-pressed={muted}
            className={`grid h-7 w-7 place-items-center rounded-full border transition-colors duration-200 ${
              muted
                ? "border-magenta/40 bg-magenta/10 text-magenta"
                : "border-ink/15 text-ink-soft hover:border-ink/30 hover:text-ink"
            }`}
          >
            <SpeakerIcon muted={muted} />
          </button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            className="slider w-16 sm:w-24"
            aria-label="Master volume"
          />
        </div>
      </div>

      {status === "loading" && (
        <span className="panel-quiet px-2.5 py-1 text-[9px] uppercase tracking-[0.24em] text-ink-soft">
          loading samples…
        </span>
      )}

      {status === "error" && (
        <button
          type="button"
          onClick={onEnableAudio}
          className="panel-quiet px-2.5 py-1 text-[9px] uppercase tracking-[0.24em] text-magenta transition hover:text-ink"
        >
          tap to enable sound
        </button>
      )}

      {usingFallback && status === "ready" && (
        <span className="panel-quiet px-2.5 py-1 text-[9px] uppercase tracking-[0.24em] text-ink-faint">
          synth fallback
        </span>
      )}
    </div>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 6h2.2L8.4 3.4v9.2L5.2 10H3V6Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {muted ? (
        <path d="M11 5.6 14 8.8M14 5.6 11 8.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      ) : (
        <path
          d="M10.6 5.4a3.4 3.4 0 0 1 0 5.2M12.5 3.6a5.8 5.8 0 0 1 0 8.8"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
