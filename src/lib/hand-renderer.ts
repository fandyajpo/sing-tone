import { clamp, clamp01 } from "./hand-geometry";

/** One armed (visibly extended) fingertip, drawn as an interaction marker. */
export interface RenderFingertip {
  x: number;
  y: number;
  /** True while this fingertip is sounding a note. */
  active: boolean;
  /** Extension confidence 0..1, drawn as a partial ring. */
  extension: number;
  label: string | null;
  /** 1 immediately after a strike, decaying to 0. */
  pulse: number;
  /** active = sounding, detected = confident but not armed, unstable = low trust. */
  tone?: "active" | "detected" | "unstable";
  /** Vertical motion in canvas pixels over recent frames, drawn as a trail. */
  lean?: number;
}

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
 * Draws fingertip markers, note labels and particles. There is deliberately no
 * hand skeleton, palm glow or wrist marker: only exposed fingertips are
 * interaction points, so only those are visualised.
 */
export class HandVisionRenderer {
  private readonly pool: Particle[] = Array.from({ length: MAX_PARTICLES }, makeParticle);
  private readonly cursor = { index: 0 };
  private trailAccumulator = 0;

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
    for (const particle of this.pool) {
      if (particle.life <= 0) continue;
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 16 * dt;
      const friction = Math.pow(particle.drag, dt * 60);
      particle.vx *= friction;
      particle.vy *= friction;
    }
  }

  draw(ctx: CanvasRenderingContext2D, tips: readonly RenderFingertip[], width: number): void {
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
    this.drawParticles(ctx);
    ctx.restore();
  }

  private drawHalo(ctx: CanvasRenderingContext2D, tip: RenderFingertip): void {
    const tone = tip.tone ?? (tip.active ? "active" : "detected");
    const radius = tone === "active" ? 28 : tone === "detected" ? 20 : 16;
    const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, radius);
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
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, radius, 0, Math.PI * 2);
    ctx.fill();
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

    // Directional trail behind a moving fingertip.
    if (tone === "active" && Math.abs(lean) > 1.5) {
      const trail = ctx.createLinearGradient(tip.x, tip.y, tip.x, tip.y - lean);
      trail.addColorStop(0, "rgba(232, 197, 138, 0.35)");
      trail.addColorStop(1, "rgba(232, 197, 138, 0)");
      ctx.strokeStyle = trail;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y - lean);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
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
