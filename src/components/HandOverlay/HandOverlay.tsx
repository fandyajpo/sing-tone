import type { RefObject } from "react";

interface HandOverlayProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * Full-screen canvas for the fingertip markers and particles, plus the paper
 * vignette. Everything here is painted by the performance loop, never by React.
 */
export function HandOverlay({ canvasRef }: HandOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />
      <div className="grain" />
      <div className="vignette" />
    </div>
  );
}
