import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { AudioEngine } from "../../lib/audio-engine";
import { WAVE_STRIP_HEIGHT } from "../../lib/keyboard-geometry";

interface WaveformVisualizerProps {
  audioRef: RefObject<AudioEngine | null>;
}

/**
 * Bottom-of-screen master waveform. Runs on its own rAF loop reading the Tone
 * analyser, entirely outside React's render path.
 */
export function WaveformVisualizer({ audioRef }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let phase = 0;
    let lastDraw = 0;
    // Width-keyed so a resize rebuilds the gradients instead of every frame.
    let edge: CanvasGradient | null = null;
    let stroke: CanvasGradient | null = null;
    let gradientWidth = -1;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      // The strip is decoration: half the frame rate is invisible and halves
      // the path work, and a hidden tab costs nothing.
      if (document.hidden) return;
      if (now - lastDraw < 32) return;
      lastDraw = now;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const mid = height * 0.56;
      const amplitude = height * 0.34;
      const data = audioRef.current?.getWaveform() ?? null;
      phase += 0.018;

      if (width !== gradientWidth) {
        gradientWidth = width;
        const nextEdge = ctx.createLinearGradient(0, 0, width, 0);
        nextEdge.addColorStop(0, "rgba(185, 130, 73, 0)");
        nextEdge.addColorStop(0.5, "rgba(185, 130, 73, 0.3)");
        nextEdge.addColorStop(1, "rgba(185, 130, 73, 0)");
        edge = nextEdge;

        const nextStroke = ctx.createLinearGradient(0, 0, width, 0);
        nextStroke.addColorStop(0, "rgba(185, 130, 73, 0.45)");
        nextStroke.addColorStop(0.45, "rgba(214, 164, 93, 0.9)");
        nextStroke.addColorStop(0.75, "rgba(185, 130, 73, 0.8)");
        nextStroke.addColorStop(1, "rgba(232, 197, 138, 0.5)");
        stroke = nextStroke;
      }

      // Hairline at the top of the strip.
      ctx.fillStyle = edge ?? "rgba(185, 130, 73, 0.3)";
      ctx.fillRect(0, 0, width, 1);

      // Zero line.
      ctx.fillStyle = "rgba(169, 155, 136, 0.12)";
      ctx.fillRect(0, mid, width, 1);

      const stride = data ? Math.max(1, Math.floor(data.length / 320)) : 4;
      const samples = data ? Math.floor(data.length / stride) : 260;

      const trace = (gain: number) => {
        ctx.beginPath();
        for (let index = 0; index < samples; index += 1) {
          const t = index / Math.max(1, samples - 1);
          let value: number;
          if (data) {
            const source = data[index * stride];
            value = (source ?? 0) * gain;
          } else {
            value = Math.sin(t * Math.PI * 7 + phase) * 0.012 * gain;
          }
          const x = t * width;
          const y = mid - value * amplitude;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.strokeStyle = "rgba(185, 130, 73, 0.12)";
      ctx.lineWidth = 4;
      trace(1);

      ctx.strokeStyle = stroke ?? "rgba(214, 164, 93, 0.9)";
      ctx.lineWidth = 1.1;
      trace(1);

      // Soft glow under the trace, kept low so it reads analog, not neon.
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(185, 130, 73, 0.05)";
      ctx.lineWidth = 9;
      trace(1);
      ctx.globalCompositeOperation = "source-over";
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [audioRef]);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 overflow-hidden"
      style={{ height: WAVE_STRIP_HEIGHT }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-paper via-paper/60 to-transparent" />
      <canvas ref={canvasRef} className="relative h-full w-full" aria-hidden="true" />
      <div className="absolute bottom-1.5 left-3 flex items-center gap-1.5 sm:left-5">
        <span className="h-1 w-1 rounded-[1px] bg-gold/70" />
        <span className="font-mono text-[9px] uppercase tracking-[0.26em] text-ink-faint">
          master out
        </span>
      </div>
    </div>
  );
}
