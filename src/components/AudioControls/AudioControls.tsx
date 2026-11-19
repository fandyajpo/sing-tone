import type { RefObject } from "react";
import type { AudioEngine } from "../../lib/audio-engine";
import type { AudioStatus } from "../../types/audio";
import { Button } from "../ui/Button";
import { Slider } from "../ui/Slider";
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
    <div className="panel tone-cobalt flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-[0.24em] text-ink-faint">Master out</span>
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-gold/80">
          {status === "ready" ? (muted ? "muted" : "live") : status}
        </span>
      </div>

      <LevelMeter engineRef={engineRef} muted={muted} />

      <Slider
        label="Volume"
        value={volume}
        onChange={onVolumeChange}
        display={`${Math.round(volume * 100)}`}
      />

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant={muted ? "gold" : "outline"}
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? "Unmute audio" : "Mute audio"}
          className="flex-1"
        >
          <SpeakerIcon muted={muted} />
          {muted ? "Muted" : "Sound"}
        </Button>
        {status === "error" && (
          <Button size="sm" variant="gold" onClick={onEnableAudio}>
            Enable
          </Button>
        )}
      </div>

      {status === "loading" && (
        <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-ink-faint">
          loading samples…
        </span>
      )}
      {usingFallback && status === "ready" && (
        <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-ink-faint">
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
