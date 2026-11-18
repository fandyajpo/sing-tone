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
    const radius = tip.active ? 34 : 22;
    const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, radius);
    glow.addColorStop(
      0,
      tip.active ? "rgba(255, 206, 142, 0.5)" : "rgba(255, 214, 172, 0.22)",
    );
    glow.addColorStop(0.5, tip.active ? "rgba(255, 158, 92, 0.16)" : "rgba(255, 200, 160, 0.06)");
    glow.addColorStop(1, "rgba(255, 150, 90, 0)");
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
    const ringRadius = tip.active ? 11 : 9.5;
    const confidence = clamp01(tip.extension);

    // Faint full ring.
    ctx.strokeStyle = "rgba(255, 224, 190, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Extension confidence arc: a fingertip that is only just armed reads short.
    ctx.strokeStyle = tip.active ? "rgba(255, 226, 176, 0.95)" : "rgba(255, 218, 175, 0.55)";
    ctx.lineWidth = 1.6;
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
      ctx.strokeStyle = `rgba(255, 216, 165, ${0.45 * tip.pulse})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 8 + spread * 30, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 120, 150, ${0.2 * tip.pulse})`;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 5 + spread * 48, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = tip.active ? "#ffeccb" : "rgba(255, 230, 200, 0.8)";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, tip.active ? 3.4 : 2.4, 0, Math.PI * 2);
    ctx.fill();

    if (tip.label) {
      drawNoteLabel(ctx, tip.x, tip.y, tip.label, width);
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.pool) {
      if (particle.life <= 0) continue;
      const alpha = clamp01(particle.life / particle.maxLife);
      const r = Math.round(240 + particle.ember * 15);
      const g = Math.round(150 + (1 - particle.ember) * 70);
      const b = Math.round(90 + particle.ember * 45);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.75})`;
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

  ctx.fillStyle = "rgba(8, 6, 10, 0.62)";
  ctx.fillRect(boxX - 5, boxY, textWidth + 10, 16);
  ctx.strokeStyle = "rgba(255, 206, 150, 0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX - 5.5, boxY + 0.5, textWidth + 11, 15);

  ctx.fillStyle = "#ffe9c9";
  ctx.fillText(label, boxX, boxY + 11.5);
  ctx.restore();
}
