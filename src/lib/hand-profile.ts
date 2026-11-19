import type { FingerName, Handedness } from "../types/hand";
import { clamp } from "./hand-geometry";

const STORAGE_PREFIX = "sing-tone:hand-profile:v2:";
const LEARN_RATE = 0.08;
const SAVE_EVERY = 25;

/**
 * A performer's own hand proportions, learned from an open relaxed hand. The
 * recognizer normalizes against this when present, so a short pinky or a long
 * thumb is measured against itself rather than an average hand. The profile is
 * persisted per hand and reused on later sessions; calibration is never
 * mandatory.
 */
export class HandProfile {
  private readonly handedness: Handedness;
  private readonly ratios = new Map<FingerName, number>();
  private observations = 0;

  constructor(handedness: Handedness) {
    this.handedness = handedness;
    this.load();
  }

  get sampleCount(): number {
    return this.observations;
  }

  ratioFor(finger: FingerName): number | undefined {
    if (this.observations === 0) return undefined;
    return this.ratios.get(finger);
  }

  /** Records one open-hand observation. Ratios are tip-to-knuckle / palmWidth. */
  absorb(ratios: Partial<Record<FingerName, number>>): void {
    let recorded = false;
    for (const [finger, ratio] of Object.entries(ratios) as [FingerName, number][]) {
      if (!Number.isFinite(ratio) || ratio < 0.2 || ratio > 1.8) continue;
      const previous = this.ratios.get(finger);
      const next = previous === undefined ? ratio : previous + (ratio - previous) * LEARN_RATE;
      this.ratios.set(finger, clamp(next, 0.2, 1.8));
      recorded = true;
    }
    if (!recorded) return;
    this.observations += 1;
    if (this.observations % SAVE_EVERY === 0) this.save();
  }

  /** Forgets the learned proportions; the next open hand trains a new profile. */
  recalibrate(): void {
    this.ratios.clear();
    this.observations = 0;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(this.storageKey());
    } catch {
      // Private mode: the profile simply lives for this session.
    }
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}${this.handedness}`;
  }

  private load(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(this.storageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        observations?: number;
        ratios?: Partial<Record<FingerName, number>>;
      };
      if (!parsed.ratios) return;
      for (const [finger, ratio] of Object.entries(parsed.ratios) as [FingerName, number][]) {
        if (Number.isFinite(ratio)) this.ratios.set(finger, clamp(ratio, 0.2, 1.8));
      }
      this.observations = typeof parsed.observations === "number" ? parsed.observations : 1;
    } catch {
      // Corrupt or blocked storage: fall back to the anatomical defaults.
    }
  }

  private save(): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        this.storageKey(),
        JSON.stringify({ observations: this.observations, ratios: Object.fromEntries(this.ratios) }),
      );
    } catch {
      // Persistence is best effort; recognition still works without it.
    }
  }
}
