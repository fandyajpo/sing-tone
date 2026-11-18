import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { CameraStatus } from "../../hooks/useCamera";

interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  trackingReady: boolean;
  handsVisible: number;
  chordActive: boolean;
  mode?: "chords" | "pitch";
}

export function CameraView({
  videoRef,
  status,
  trackingReady,
  handsVisible,
  chordActive,
  mode = "chords",
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

  const pitchMode = mode === "pitch";

  return (
    <div className="absolute inset-0 overflow-hidden bg-paper">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-label="Live camera feed"
        className="absolute inset-0 h-full w-full -scale-x-100 object-cover opacity-90"
        style={{ filter: "saturate(0.6) contrast(1.06) brightness(0.8)" }}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(85%_65%_at_50%_32%,rgba(232,165,101,0.06),transparent_62%)]" />

      {status !== "ready" && <div className="absolute inset-0 bg-[#060508]/88 backdrop-blur-md" />}

      {showHint && (
        <div className="absolute inset-x-0 top-[42%] flex -translate-y-1/2 justify-center px-6">
          <div className="animate-fade-up max-w-xs rounded-2xl border border-white/10 bg-[#0d0a11]/64 px-4 py-3 text-center backdrop-blur">
            <span className="text-[9px] uppercase tracking-[0.3em] text-white/45">
              {handsVisible === 0 ? "no hands detected" : pitchMode ? "no fingers held" : "no chord sign"}
            </span>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/55">
              {handsVisible === 0
                ? pitchMode
                  ? "Raise a hand into the frame and extend a finger. Lift it to raise the pitch, lower it to bend down."
                  : "Raise both hands into the frame, palms toward the camera, then hold up one to five fingers on your left hand."
                : pitchMode
                  ? "Extend any fingertip and slide it up or down. Each held finger sounds its own continuous pitch."
                  : "Hold up 1–5 fingers on your left hand to pick the chord degree, then show your right hand to set the voicing."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
