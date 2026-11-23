import { clamp, clamp01 } from "./hand-geometry";
import type { FingerName, Handedness } from "../types/hand";
import { HAND_CONNECTIONS } from "../types/hand";

/** One armed (visibly extended) fingertip, drawn as an interaction marker. */
export interface RenderFingertip {
  x: number;
  y: number;
  /** True while this fingertip is sounding a note. */
  active: boolean;
  /** Extension confidence 0..1, drawn as a partial ring. */
  extension: number;
  label: string | null;
  /** Which finger this is; drawn as a T/I/M/R/P tag under the marker. */
  finger?: FingerName;
  /** 1 immediately after a strike, decaying to 0. */
  pulse: number;
  /** active = sounding, detected = confident but not armed, unstable = low trust. */
  tone?: "active" | "detected" | "unstable";
  /** Vertical motion in canvas pixels over recent frames, drawn as a trail. */
  lean?: number;
}

/**
 * One tracked hand. The wireframe answers the question a performer always asks
 * first: is the tracker seeing my hand, and where does it think my fingers are?
 */
export interface RenderHand {
  side: Handedness;
  /** Chip heading, e.g. "Left hand" or "Left · degree". */
  label: string;
  /** Chip status, e.g. "96% · 3 of 5 held". */
  detail: string;
  /** The 21 MediaPipe landmarks in display space. */
  points: ReadonlyArray<{ x: number; y: number }>;
  /** Detection score 0..1, drawn as the chip's lock bar. */
  confidence: number;
}

const SIDE_TONE: Record<Handedness, { rgb: string; solid: string }> = {
  left: { rgb: "69, 99, 255", solid: "#4563ff" },
  right: { rgb: "255, 107, 97", solid: "#ff6b61" },
};

const FINGER_GLYPH: Record<FingerName, string> = {
  thumb: "T",
  index: "I",
  middle: "M",
  ring: "R",
  pinky: "P",
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  ember: number;
  drag: number;
}

const MAX_PARTICLES = 220;

function makeParticle(): Particle {
  return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, ember: 0, drag: 0.9 };
}

/**
 * Draws the tracked hand, fingertip markers, note labels and particles.
 *
 * The wireframe and its chip exist to be read, not played: they tell a
 * performer which hand the tracker has locked, how confident it is, and which
 * finger each marker belongs to. All interaction still happens at exposed
 * fingertips, which carry the rings and the note names.
 */
export class HandVisionRenderer {
  private readonly pool: Particle[] = Array.from({ length: MAX_PARTICLES }, makeParticle);
  private readonly cursor = { index: 0 };
  private trailAccumulator = 0;
  /**
   * Gradients are position-independent when drawn through a translate, so each
   * tone is built once instead of rebuilt for every fingertip on every frame.
   * Creating one costs about 5× a cached fill.
   */
  private readonly glows = new Map<string, CanvasGradient>();
  private trailGradient: CanvasGradient | null = null;
  private alive = 0;

  burst(x: number, y: number, strength: number): void {
    const count = Math.round(10 + strength * 12);
    for (let i = 0; i < count; i += 1) this.spawn(x, y, 1.1, true);
  }

  /** Slow ambient sparks while a fingertip holds a note. */
  emit(x: number, y: number, dt: number): void {
    this.trailAccumulator += dt;
    if (this.trailAccumulator < 0.055) return;
    this.trailAccumulator = 0;
    this.spawn(x, y, 0.4, false);
  }

  private spawn(x: number, y: number, strength: number, energetic: boolean): void {
    const particle = this.pool[this.cursor.index % this.pool.length] ?? makeParticle();
    this.cursor.index += 1;
    if (particle.life <= 0) this.alive += 1;

    const angle = Math.random() * Math.PI * 2;
    const speed = (energetic ? 26 + Math.random() * 70 : 8 + Math.random() * 22) * strength;
    const life = energetic ? 0.55 + Math.random() * 0.7 : 0.9 + Math.random() * 0.8;

    particle.x = x;
    particle.y = y;
    particle.vx = Math.cos(angle) * speed;
    particle.vy = Math.sin(angle) * speed - (energetic ? 12 : 26);
    particle.life = life;
    particle.maxLife = life;
    particle.size = energetic ? 1.1 + Math.random() * 1.5 : 0.7 + Math.random() * 1;
    particle.ember = Math.random();
    particle.drag = energetic ? 0.9 : 0.96;
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    for (const particle of this.pool) {
      if (particle.life <= 0) continue;
      particle.life -= dt;
      if (particle.life <= 0) this.alive -= 1;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 16 * dt;
      const friction = Math.pow(particle.drag, dt * 60);
      particle.vx *= friction;
      particle.vy *= friction;
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    tips: readonly RenderFingertip[],
    width: number,
    height: number,
    hands: readonly RenderHand[] = [],
  ): void {
    if (hands.length > 0) {
      ctx.save();
      for (const hand of hands) this.drawSkeleton(ctx, hand);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const tip of tips) {
      this.drawHalo(ctx, tip);
    }

    ctx.globalCompositeOperation = "source-over";

    for (const tip of tips) {
      this.drawMarker(ctx, tip, width);
    }

    ctx.globalCompositeOperation = "lighter";
    if (this.alive > 0) this.drawParticles(ctx);
    ctx.restore();

    // Chips last: they are labels and must never sit under a glow.
    for (const hand of hands) this.drawHandChip(ctx, hand, width, height);
  }

  /**
   * A quiet wireframe over the performer's real hand: palm body, bones, joints.
   * It is deliberately drawn under the fingertip markers so it never competes
   * with the notes, but it makes the detection legible frame by frame.
   */
  private drawSkeleton(ctx: CanvasRenderingContext2D, hand: RenderHand): void {
    const points = hand.points;
    if (points.length < 21) return;
    const tone = SIDE_TONE[hand.side];

    // Palm body: wrist, the four knuckles and the thumb base. These five never
    // cross each other on a real hand, so the fill stays stable.
    const wrist = points[0];
    if (wrist) {
      ctx.fillStyle = `rgba(${tone.rgb}, 0.07)`;
      ctx.beginPath();
      ctx.moveTo(wrist.x, wrist.y);
      for (const index of [5, 9, 13, 17]) {
        const point = points[index];
        if (point) ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Bones, as one path and one stroke.
    ctx.strokeStyle = `rgba(${tone.rgb}, 0.52)`;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const [from, to] of HAND_CONNECTIONS) {
      const a = points[from];
      const b = points[to];
      if (!a || !b) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    // Joints sit on a dark seat so they stay legible over skin, cloth and a
    // bright window alike.
    ctx.fillStyle = "rgba(13, 10, 8, 0.42)";
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (!point) continue;
      ctx.beginPath();
      ctx.arc(point.x, point.y, i === 0 ? 5 : 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = tone.solid;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (!point) continue;
      ctx.beginPath();
      ctx.arc(point.x, point.y, i === 0 ? 3.4 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * The wrist chip: hand name, live detection quality and a lock bar. It is the
   * one place that says "tracked" in plain words, so nobody has to infer
   * whether the wireframe is stale.
   */
  private drawHandChip(
    ctx: CanvasRenderingContext2D,
    hand: RenderHand,
    width: number,
    height: number,
  ): void {
    const wrist = hand.points[0];
    if (!wrist) return;
    const tone = SIDE_TONE[hand.side];

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    const title = hand.label.toUpperCase();
    const titleWidth = ctx.measureText(title).width;
    ctx.font = "500 8px ui-monospace, SFMono-Regular, Menlo, monospace";
    const detailWidth = ctx.measureText(hand.detail).width;

    const boxWidth = Math.max(titleWidth, detailWidth) + 22;
    const boxHeight = 34;
    const boxX = clamp(wrist.x - boxWidth / 2, 6, Math.max(6, width - boxWidth - 6));
    const boxY = clamp(wrist.y + 18, 6, Math.max(6, height - boxHeight - 6));

    ctx.fillStyle = "rgba(13, 10, 8, 0.86)";
    drawRoundRect(ctx, boxX, boxY, boxWidth, boxHeight, 3);
    ctx.fill();
    ctx.strokeStyle = `rgba(${tone.rgb}, 0.92)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = tone.solid;
    ctx.fillRect(boxX + 1, boxY + 4, 3, boxHeight - 8);

    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#f1e8d9";
    ctx.fillText(title, boxX + 11, boxY + 13.5);

    ctx.font = "500 8px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "rgba(241, 232, 217, 0.7)";
    ctx.fillText(hand.detail, boxX + 11, boxY + 24.5);

    const lock = clamp01(hand.confidence);
    const barWidth = boxWidth - 22;
    ctx.fillStyle = "rgba(241, 232, 217, 0.16)";
    ctx.fillRect(boxX + 11, boxY + boxHeight - 5, barWidth, 2);
    ctx.fillStyle = tone.solid;
    ctx.fillRect(boxX + 11, boxY + boxHeight - 5, barWidth * lock, 2);
    ctx.restore();
  }

  private drawHalo(ctx: CanvasRenderingContext2D, tip: RenderFingertip): void {
    const tone = tip.tone ?? (tip.active ? "active" : "detected");
    const radius = tone === "active" ? 28 : tone === "detected" ? 20 : 16;

    let glow = this.glows.get(tone);
    if (!glow) {
      glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      glow.addColorStop(
        0,
        tone === "active"
          ? "rgba(232, 197, 138, 0.34)"
          : tone === "detected"
            ? "rgba(185, 130, 73, 0.2)"
            : "rgba(169, 155, 136, 0.12)",
      );
      glow.addColorStop(0.5, "rgba(185, 130, 73, 0.07)");
      glow.addColorStop(1, "rgba(185, 130, 73, 0)");
      this.glows.set(tone, glow);
    }

    ctx.save();
    ctx.translate(tip.x, tip.y);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawMarker(
    ctx: CanvasRenderingContext2D,
    tip: RenderFingertip,
    width: number,
  ): void {
    const tone = tip.tone ?? (tip.active ? "active" : "detected");
    const ringRadius = tone === "active" ? 11 : 9;
    const confidence = clamp01(tip.extension);
    const lean = Math.max(-26, Math.min(26, tip.lean ?? 0));

    // Directional trail behind a moving fingertip. One gradient serves every
    // marker: it is built along a fixed axis and scaled to the current lean.
    if (tone === "active" && Math.abs(lean) > 1.5) {
      if (!this.trailGradient) {
        const trail = ctx.createLinearGradient(0, 0, 0, -26);
        trail.addColorStop(0, "rgba(232, 197, 138, 0.35)");
        trail.addColorStop(1, "rgba(232, 197, 138, 0)");
        this.trailGradient = trail;
      }
      ctx.save();
      ctx.translate(tip.x, tip.y);
      ctx.scale(1, (Math.abs(lean) / 26) * (lean < 0 ? -1 : 1));
      ctx.strokeStyle = this.trailGradient;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.restore();
    }

    // Faint full ring.
    ctx.strokeStyle = "rgba(232, 197, 138, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Extension confidence arc: a fingertip that is only just armed reads short.
    ctx.strokeStyle =
      tone === "active"
        ? "rgba(232, 197, 138, 0.95)"
        : tone === "detected"
          ? "rgba(185, 130, 73, 0.75)"
          : "rgba(169, 155, 136, 0.5)";
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.arc(
      tip.x,
      tip.y,
      ringRadius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * confidence,
    );
    ctx.stroke();

    if (tip.active && tip.pulse > 0) {
      const spread = 1 - tip.pulse;
      ctx.strokeStyle = `rgba(232, 197, 138, ${0.35 * tip.pulse})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 8 + spread * 24, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(185, 130, 73, ${0.16 * tip.pulse})`;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 5 + spread * 38, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle =
      tone === "active"
        ? "#f1e8d9"
        : tone === "detected"
          ? "rgba(185, 130, 73, 0.9)"
          : "rgba(169, 155, 136, 0.7)";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, tone === "active" ? 3.4 : 2.4, 0, Math.PI * 2);
    ctx.fill();

    // Little corner ticks give the marker a bolder, instrument-panel read.
    if (tone === "active") {
      const arm = 5;
      ctx.strokeStyle = "rgba(13, 10, 8, 0.55)";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(tip.x - ringRadius - arm, tip.y - ringRadius);
      ctx.lineTo(tip.x - ringRadius, tip.y - ringRadius);
      ctx.lineTo(tip.x - ringRadius, tip.y - ringRadius - arm);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tip.x + ringRadius + arm, tip.y + ringRadius);
      ctx.lineTo(tip.x + ringRadius, tip.y + ringRadius);
      ctx.lineTo(tip.x + ringRadius, tip.y + ringRadius + arm);
      ctx.stroke();
    }

    if (tip.finger) {
      drawFingerTag(
        ctx,
        tip.x,
        tip.y + ringRadius + 10,
        FINGER_GLYPH[tip.finger],
        tone === "active",
      );
    }

    if (tip.label) {
      drawNoteLabel(ctx, tip.x, tip.y, tip.label, width);
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.pool) {
      if (particle.life <= 0) continue;
      const alpha = clamp01(particle.life / particle.maxLife);
      const r = Math.round(214 + particle.ember * 18);
      const g = Math.round(150 + (1 - particle.ember) * 47);
      const b = Math.round(93 + particle.ember * 35);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.55})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (0.5 + alpha * 0.9), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFingerTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  glyph: string,
  active: boolean,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.font = "600 8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(13, 10, 8, 0.65)";
  ctx.fillText(glyph, x, y + 0.8);
  ctx.fillStyle = active ? "rgba(241, 232, 217, 0.95)" : "rgba(241, 232, 217, 0.62)";
  ctx.fillText(glyph, x, y);
  ctx.restore();
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawNoteLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  width: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";

  const textWidth = ctx.measureText(label).width;
  const boxX = clamp(x + 15, 6, Math.max(6, width - textWidth - 20));
  const boxY = clamp(y - 29, 8, Number.POSITIVE_INFINITY);

  ctx.fillStyle = "rgba(25, 22, 19, 0.9)";
  ctx.fillRect(boxX - 5, boxY, textWidth + 10, 16);
  ctx.strokeStyle = "rgba(214, 164, 93, 0.75)";
  ctx.lineWidth = 1.6;
  ctx.strokeRect(boxX - 5.5, boxY + 0.5, textWidth + 11, 15);

  ctx.fillStyle = "#f1e8d9";
  ctx.fillText(label, boxX, boxY + 11.5);
  ctx.restore();
}
