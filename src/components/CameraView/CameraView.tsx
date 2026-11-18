import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { CameraStatus } from "../../hooks/useCamera";

interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  trackingReady: boolean;
  handsVisible: number;
  chordActive: boolean;
}

export function CameraView({
  videoRef,
  status,
  trackingReady,
  handsVisible,
  chordActive,
}: CameraViewProps) {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (status !== "ready" || !trackingReady || chordActive) {
      setShowHint(false);
      return;
    }
    const timer = window.setTimeout(() => setShowHint(true), 2200);
    return () => window.clearTimeout(timer);
  }, [status, trackingReady, chordActive]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-paper">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-label="Live camera feed"
        className="absolute inset-0 h-full w-full -scale-x-100 object-cover opacity-95"
        style={{ filter: "saturate(0.82) contrast(1.02) brightness(0.98)" }}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_35%,rgba(255,244,226,0.16),transparent_65%)]" />

      {status !== "ready" && <div className="absolute inset-0 bg-paper/90 backdrop-blur-md" />}

      {showHint && (
        <div className="absolute inset-x-0 top-[42%] flex -translate-y-1/2 justify-center px-6">
          <div className="animate-fade-up max-w-xs rounded-2xl border border-ink/10 bg-white/90 px-4 py-3 text-center shadow-[0_20px_44px_-30px_rgba(70,52,28,0.55)] backdrop-blur">
            <span className="text-[9px] uppercase tracking-[0.3em] text-ink-faint">
              {handsVisible === 0 ? "no hands detected" : "no chord sign"}
            </span>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
              {handsVisible === 0
                ? "Raise both hands into the frame, palms toward the camera, then hold up one to five fingers on your left hand."
                : "Hold up 1–5 fingers on your left hand to pick the chord degree, then show your right hand to set the voicing."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
