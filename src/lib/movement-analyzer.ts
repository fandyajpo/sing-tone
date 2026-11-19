export type MoveDirection = "up" | "down" | "horizontal" | "stationary";

export interface MoveSample {
  /** Normalized units per second. */
  vx: number;
  vy: number;
  /** Resulting speed in normalized units per second. */
  speed: number;
  direction: MoveDirection;
  rapid: boolean;
}

/** Below this speed a fingertip counts as still (camera jitter lives under it). */
const STATIONARY_SPEED = 0.09;
const RAPID_SPEED = 0.65;

interface Track {
  x: number;
  y: number;
  t: number;
  vx: number;
  vy: number;
}

/**
 * Turns successive fingertip positions into velocity and direction using real
 * elapsed time, so a fluctuating webcam frame rate cannot fake acceleration.
 */
export class MovementAnalyzer {
  private readonly tracks = new Map<string, Track>();

  update(key: string, x: number, y: number, now: number): MoveSample | null {
    const previous = this.tracks.get(key);
    if (!previous) {
      this.tracks.set(key, { x, y, t: now, vx: 0, vy: 0 });
      return null;
    }

    const dt = Math.max(0.001, (now - previous.t) / 1000);
    if (dt > 0.4) {
      // Long gap (hand lost or tab hidden): restart without a velocity spike.
      this.tracks.set(key, { x, y, t: now, vx: 0, vy: 0 });
      return { vx: 0, vy: 0, speed: 0, direction: "stationary", rapid: false };
    }

    const rawVx = (x - previous.x) / dt;
    const rawVy = (y - previous.y) / dt;
    const vx = previous.vx + (rawVx - previous.vx) * 0.4;
    const vy = previous.vy + (rawVy - previous.vy) * 0.4;
    this.tracks.set(key, { x, y, t: now, vx, vy });

    const speed = Math.hypot(vx, vy);
    // Direction follows the instantaneous velocity so a reversal registers on
    // the same frame; speed stays smoothed so the readout is calm.
    const rawSpeed = Math.hypot(rawVx, rawVy);
    let direction: MoveDirection = "stationary";
    if (rawSpeed >= STATIONARY_SPEED) {
      // MediaPipe Y grows downward, so negative vy means the finger is rising.
      direction =
        Math.abs(rawVy) >= Math.abs(rawVx) ? (rawVy < 0 ? "up" : "down") : "horizontal";
    }

    return { vx, vy, speed, direction, rapid: speed >= RAPID_SPEED };
  }

  drop(key: string): void {
    this.tracks.delete(key);
  }

  reset(): void {
    this.tracks.clear();
  }
}
