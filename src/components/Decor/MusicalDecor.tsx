import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

type DecorStyle = CSSProperties & {
  "--depth"?: number;
  "--dur"?: string;
  "--delay"?: string;
  "--drift"?: string;
  "--dx"?: string;
  "--dy"?: string;
};

interface Note {
  glyph: string;
  x: number;
  y: number;
  size: number;
  tone: string;
  dur: string;
  delay: string;
  depth: number;
  drift: string;
  gradient?: string;
  hideSm?: boolean;
}

/* Composed against the editorial grid: margins, column gutter and corners. */
const NOTES: Note[] = [
  {
    glyph: "♪",
    x: 1.5,
    y: 63,
    size: 38,
    tone: "var(--color-coral)",
    dur: "12s",
    delay: "-2s",
    depth: 16,
    drift: "10px",
  },
  {
    glyph: "♬",
    x: 93,
    y: 74,
    size: 34,
    tone: "var(--color-cobalt)",
    dur: "14s",
    delay: "-6s",
    depth: 22,
    drift: "-12px",
    gradient: "linear-gradient(140deg, #4563ff, #b9a4f5)",
  },
  {
    glyph: "♫",
    x: 1,
    y: 20,
    size: 26,
    tone: "var(--color-lilac)",
    dur: "13s",
    delay: "-3s",
    depth: 14,
    drift: "8px",
    hideSm: true,
  },
  {
    glyph: "♩",
    x: 95,
    y: 14,
    size: 24,
    tone: "var(--color-lemon)",
    dur: "11s",
    delay: "-5s",
    depth: 20,
    drift: "-8px",
    hideSm: true,
  },
  {
    glyph: "♪",
    x: 34,
    y: 93,
    size: 22,
    tone: "var(--color-tangerine)",
    dur: "15s",
    delay: "-7s",
    depth: 12,
    drift: "6px",
  },
  {
    glyph: "♫",
    x: 63,
    y: 91,
    size: 18,
    tone: "var(--color-mint)",
    dur: "16s",
    delay: "-9s",
    depth: 10,
    drift: "-6px",
    hideSm: true,
  },
];

interface Spark {
  char: string;
  x: number;
  y: number;
  size: number;
  tone: string;
  dur: string;
  delay: string;
  depth: number;
}

const SPARKS: Spark[] = [
  { char: "✦", x: 8, y: 40, size: 13, tone: "var(--color-cobalt)", dur: "5s", delay: "-1s", depth: 24 },
  { char: "✦", x: 88, y: 60, size: 12, tone: "var(--color-coral)", dur: "6.5s", delay: "-4s", depth: 28 },
  { char: "✧", x: 22, y: 87, size: 11, tone: "var(--color-lilac)", dur: "7s", delay: "-2.5s", depth: 20 },
  { char: "✧", x: 72, y: 86, size: 10, tone: "var(--color-tangerine)", dur: "5.5s", delay: "-3.5s", depth: 16 },
];

const BURSTS = [
  { x: 12, y: 52, dur: "9s", delay: "-1s", tone: "var(--color-coral)" },
  { x: 86, y: 38, dur: "11s", delay: "-6s", tone: "var(--color-cobalt)" },
];

const PARTICLE_CHARS = ["♪", "✦", "♬", "·", "✧", "♫"];

export function MusicalDecor() {
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;

    const paint = () => {
      frame = 0;
      layer.style.setProperty("--px", x.toFixed(3));
      layer.style.setProperty("--py", y.toFixed(3));
    };

    const onMove = (event: PointerEvent) => {
      x = (event.clientX / window.innerWidth - 0.5) * 2;
      y = (event.clientY / window.innerHeight - 0.5) * 2;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={layerRef} className="decor-layer" aria-hidden="true">
      {NOTES.map((note) => {
        const style: DecorStyle = {
          left: `${note.x}%`,
          top: `${note.y}%`,
          "--depth": note.depth,
        };
        const glyphStyle: DecorStyle = {
          fontSize: `${note.size}px`,
          color: note.gradient ? "transparent" : note.tone,
          backgroundImage: note.gradient,
          "--dur": note.dur,
          "--delay": note.delay,
          "--drift": note.drift,
        };
        return (
          <span
            key={`${note.glyph}-${note.x}-${note.y}`}
            className={`decor-item ${note.hideSm ? "decor-hide-sm" : ""}`}
            style={style}
          >
            <span
              className={`decor-glyph decor-note ${note.gradient ? "decor-glyph-grad" : ""}`}
              style={glyphStyle}
            >
              {note.glyph}
            </span>
          </span>
        );
      })}

      {SPARKS.map((spark) => {
        const style: DecorStyle = {
          left: `${spark.x}%`,
          top: `${spark.y}%`,
          "--depth": spark.depth,
        };
        const glyphStyle: DecorStyle = {
          fontSize: `${spark.size}px`,
          color: spark.tone,
          "--dur": spark.dur,
          "--delay": spark.delay,
        };
        return (
          <span key={`${spark.char}-${spark.x}`} className="decor-item" style={style}>
            <span className="decor-glyph decor-spark" style={glyphStyle}>
              {spark.char}
            </span>
          </span>
        );
      })}

      {BURSTS.map((burst) => (
        <span
          key={`${burst.x}-${burst.y}`}
          className="decor-item"
          style={{ left: `${burst.x}%`, top: `${burst.y}%` } as DecorStyle}
        >
          {PARTICLE_CHARS.map((char, index) => {
            const angle = (index / PARTICLE_CHARS.length) * Math.PI * 2;
            const style: DecorStyle = {
              color: burst.tone,
              "--dur": burst.dur,
              "--delay": burst.delay,
              "--dx": `${Math.round(Math.cos(angle) * 34)}px`,
              "--dy": `${Math.round(Math.sin(angle) * 34)}px`,
            };
            return (
              <span key={char + index} className="decor-particle" style={style}>
                {char}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}
