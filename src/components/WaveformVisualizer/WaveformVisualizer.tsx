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

    const draw = () => {
      raf = requestAnimationFrame(draw);

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

      // Hairline at the top of the strip.
      const edge = ctx.createLinearGradient(0, 0, width, 0);
      edge.addColorStop(0, "rgba(176, 96, 42, 0)");
      edge.addColorStop(0.5, "rgba(176, 96, 42, 0.28)");
      edge.addColorStop(1, "rgba(176, 96, 42, 0)");
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, width, 1);

      // Zero line.
      ctx.fillStyle = "rgba(42, 36, 28, 0.1)";
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

      ctx.strokeStyle = "rgba(176, 96, 42, 0.14)";
      ctx.lineWidth = 5;
      trace(1);

      const stroke = ctx.createLinearGradient(0, 0, width, 0);
      stroke.addColorStop(0, "rgba(196, 85, 58, 0.45)");
      stroke.addColorStop(0.45, "rgba(176, 96, 42, 0.92)");
      stroke.addColorStop(0.75, "rgba(196, 85, 58, 0.85)");
      stroke.addColorStop(1, "rgba(232, 165, 101, 0.5)");
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.2;
      trace(1);

      // Soft mirrored glow under the trace.
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(176, 96, 42, 0.08)";
      ctx.lineWidth = 12;
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
        <span className="h-1 w-1 rounded-full bg-gold/70" />
        <span className="font-mono text-[9px] uppercase tracking-[0.26em] text-ink-faint">
          master out
        </span>
      </div>
    </div>
  );
}
