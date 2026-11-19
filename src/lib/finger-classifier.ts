import type { FingerName, Handedness, HandSample } from "../types/hand";
import { FINGER_LANDMARK, FINGER_NAMES } from "../types/hand";
import { clamp01, pointAt } from "./hand-geometry";
import { FINGER_RECOGNITION } from "./finger-config";
import { analyzeHand, resolveOcclusions, smoothstep } from "./finger-extension";
import type { FingerCandidate, FingerGeometry, HandAnalysis, Vec3 } from "./finger-extension";
import { HandProfile } from "./hand-profile";

/**
 * Per-finger state. Only OPEN may produce audio; every other state is inert.
 */
export type FingerState =
  | "OPEN"
  | "CLOSED"
  | "PARTIALLY_OPEN"
  | "OCCLUDED"
  | "UNSTABLE"
  | "UNKNOWN";

export interface FingerReading {
  finger: FingerName;
  state: FingerState;
  /** Temporal trust, 0..1. */
  confidence: number;
  /** Smoothed geometric extension score, 0..1. */
  extension: number;
  /** True only while this finger is OPEN and allowed to sound. */
  active: boolean;
  visible: boolean;
  occluded: boolean;
  unstable: boolean;
  /** Mirrored display-space fingertip position. */
  x: number;
  y: number;
  anomaly: FingerGeometry["anomaly"];
  /** Full geometry for diagnostics, or null when the hand is absent. */
  geometry: FingerGeometry | null;
}

export type FingerReadings = Record<FingerName, FingerReading>;

interface Track {
  score: number;
  confidence: number;
  history: Float32Array;
  historyIndex: number;
  historyFilled: number;
  openRun: number;
  closeRun: number;
  active: boolean;
  state: FingerState;
  lastSeen: number;
  lastRelative: Vec3 | null;
  lastRelativeAt: number;
  jitter: number;
  unstableUntil: number;
  lastX: number;
  lastY: number;
}

function makeTrack(historyLength: number): Track {
  return {
    score: 0,
    confidence: 0,
    history: new Float32Array(historyLength),
    historyIndex: 0,
    historyFilled: 0,
    openRun: 0,
    closeRun: 0,
    active: false,
    state: "UNKNOWN",
    lastSeen: 0,
    lastRelative: null,
    lastRelativeAt: 0,
    jitter: 0,
    unstableUntil: 0,
    lastX: 0.5,
    lastY: 0.5,
  };
}

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function safeTuning(finger: FingerName) {
  return finger === "thumb" ? FINGER_RECOGNITION.thumb : FINGER_RECOGNITION.fingers[finger];
}

/**
 * Temporal finger recognizer.
 *
 * Geometry produces a score; this class decides whether that score can be
 * trusted. Each finger keeps its own history, confidence, jitter estimate and
 * independent state. Activation needs several consecutive qualified frames at
 * high confidence, release uses a lower threshold, and occlusion, impossible
 * geometry or landmark jumps force a non-interactive state.
 */
export class FingerClassifier {
  private readonly tracks = new Map<FingerName, Track>();
  private readonly profile: HandProfile;

  private enterOffset = 0;
  private exitOffset = 0;
  private alpha = FINGER_RECOGNITION.smoothing;

  private expectedSamples = -1;
  private expectedCache: Partial<Record<FingerName, number>> | undefined;
  private lastObservedAt = 0;

  constructor(handedness: Handedness = "right") {
    this.profile = new HandProfile(handedness);
    for (const finger of FINGER_NAMES) {
      this.tracks.set(finger, makeTrack(FINGER_RECOGNITION.historyLength));
    }
  }

  get profileSamples(): number {
    return this.profile.sampleCount;
  }

  /** Sensitivity raises or lowers every activation threshold together. */
  configure(sensitivity: number, smoothing: number): void {
    const s = clamp01(sensitivity);
    const m = clamp01(smoothing);
    this.enterOffset = (0.5 - s) * 0.14;
    this.exitOffset = (0.5 - s) * 0.08;
    this.alpha = Math.min(0.85, Math.max(0.16, 0.2 + (1 - m) * 0.42));
  }

  /** Forgets temporal state. The learned hand profile is kept. */
  reset(): void {
    for (const finger of FINGER_NAMES) {
      this.tracks.set(finger, makeTrack(FINGER_RECOGNITION.historyLength));
    }
    this.lastObservedAt = 0;
  }

  /** Clears learned proportions; the next open hand trains a new profile. */
  recalibrate(): void {
    this.profile.recalibrate();
    this.expectedSamples = -1;
    this.expectedCache = undefined;
  }

  update(hand: HandSample | null, aspect: number, now: number): FingerReadings {
    const out = {} as FingerReadings;
    const minScore = FINGER_RECOGNITION.visibility.minHandScore;
    if (!hand || hand.landmarks.length < 21 || (hand.score > 0 && hand.score < minScore)) {
      this.handleMissing(now, out);
      return out;
    }

    const analysis = analyzeHand(hand, aspect, this.expectedRatios());
    const metrics = analysis.metrics;

    const candidates: FingerCandidate[] = [];
    for (const finger of FINGER_NAMES) {
      const geometry = analysis.fingers[finger];
      const raw = pointAt(hand.landmarks, FINGER_LANDMARK[finger]);
      if (!this.inFrame(raw.x, raw.y)) continue;
      if (geometry.score < this.exitOf(finger)) continue;
      candidates.push({
        finger,
        x: (1 - raw.x) * aspect,
        y: raw.y,
        z: raw.z,
        score: geometry.score,
      });
    }
    const suppressed = resolveOcclusions(candidates, metrics.palmWidth);

    const relative: Vec3 = { x: 0, y: 0, z: 0 };
    for (const finger of FINGER_NAMES) {
      const track = this.tracks.get(finger);
      const geometry = analysis.fingers[finger];
      const raw = pointAt(hand.landmarks, FINGER_LANDMARK[finger]);
      if (!track) continue;

      const visible = this.inFrame(raw.x, raw.y) && geometry.anomaly !== "invalid-segment";
      track.lastX = 1 - raw.x;
      track.lastY = raw.y;
      // Each update returns an immutable snapshot: history and debug consumers
      // must not see a later frame's values through a shared object.
      const reading: FingerReading = {
        finger,
        state: "UNKNOWN",
        confidence: track.confidence,
        extension: geometry.score,
        active: false,
        visible,
        occluded: false,
        unstable: false,
        x: track.lastX,
        y: track.lastY,
        anomaly: geometry.anomaly,
        geometry,
      };

      // --- temporal geometry score ---------------------------------------
      track.score += (geometry.score - track.score) * this.alpha;
      this.pushHistory(track, track.score >= this.enterOf(finger));

      // --- motion / landmark-jump detection ------------------------------
      relative.x = (geometry.tip.x - metrics.center.x) / metrics.palmWidth;
      relative.y = (geometry.tip.y - metrics.center.y) / metrics.palmWidth;
      relative.z = (geometry.tip.z - metrics.center.z) / metrics.palmWidth;

      let jumped = false;
      if (track.lastRelative && track.lastRelativeAt > 0) {
        const dt = Math.max(0.001, (now - track.lastRelativeAt) / 1000);
        const displacement = distance3(relative, track.lastRelative);
        const speed = displacement / dt;
        if (
          displacement > FINGER_RECOGNITION.motion.jumpPalmPerFrame ||
          speed > FINGER_RECOGNITION.motion.jumpSpeed
        ) {
          track.unstableUntil = now + FINGER_RECOGNITION.motion.unstableHoldMs;
          jumped = true;
        }
        track.jitter += (displacement - track.jitter) * 0.25;
      }
      track.lastRelative = { ...relative };
      track.lastRelativeAt = now;

      if (visible) track.lastSeen = now;

      // --- confidence ----------------------------------------------------
      const enter = this.enterOf(finger);
      const exit = this.exitOf(finger);
      const margin = clamp01((track.score - exit) / Math.max(0.001, enter - exit));
      const consistency = this.openRatio(track);
      const jitterLimit = FINGER_RECOGNITION.motion.jitterPalm;
      const stability = 1 - smoothstep(track.jitter, jitterLimit, jitterLimit * 3);
      const weights = FINGER_RECOGNITION.confidence;
      const target = visible
        ? clamp01(margin * weights.margin + consistency * weights.consistency + stability * weights.stability)
        : 0;
      track.confidence += (target - track.confidence) * 0.3;

      // --- state ---------------------------------------------------------
      const tuning = safeTuning(finger);
      const unstable =
        jumped || (track.unstableUntil > now && track.score < enter * 1.1) || !Number.isFinite(geometry.score);

      if (!visible) {
        this.deactivate(track);
        track.state = now - track.lastSeen < FINGER_RECOGNITION.timing.occludedMs ? "OCCLUDED" : "UNKNOWN";
        reading.occluded = track.state === "OCCLUDED";
        reading.unstable = false;
        reading.geometry = null;
      } else if (suppressed.has(finger)) {
        this.deactivate(track);
        track.state = "OCCLUDED";
        reading.occluded = true;
        reading.unstable = false;
      } else if (unstable) {
        this.deactivate(track);
        track.state = "UNSTABLE";
        reading.occluded = false;
        reading.unstable = true;
      } else if (geometry.anomaly === "folded-over" || geometry.anomaly === "tip-in-palm") {
        this.deactivate(track);
        track.state = "CLOSED";
        reading.occluded = false;
        reading.unstable = false;
      } else {
        reading.occluded = false;
        reading.unstable = false;
        if (track.score >= enter) {
          track.openRun += 1;
          track.closeRun = 0;
          if (track.active) {
            track.state = "OPEN";
          } else if (
            track.openRun >= tuning.openFrames &&
            track.confidence >= Math.max(FINGER_RECOGNITION.confidence.min, tuning.minConfidence)
          ) {
            track.active = true;
            track.state = "OPEN";
          } else {
            track.state = "UNSTABLE";
            reading.unstable = true;
          }
        } else if (track.score <= exit) {
          track.closeRun += 1;
          track.openRun = 0;
          const slamming = track.score < exit * FINGER_RECOGNITION.timing.slam;
          if (track.active && (slamming || track.closeRun >= tuning.closeFrames)) {
            this.deactivate(track);
          }
          track.state = track.active ? "OPEN" : "CLOSED";
        } else {
          // Between the two thresholds: hysteresis keeps an open voice alive,
          // but a finger that never qualified stays partially open and inert.
          track.openRun = 0;
          track.closeRun = 0;
          track.state = track.active ? "OPEN" : "PARTIALLY_OPEN";
        }
      }

      reading.state = track.state;
      reading.confidence = track.confidence;
      reading.active = track.active && track.state === "OPEN";
      out[finger] = reading;
    }

    this.maybeLearnProfile(analysis, now);
    return out;
  }

  private enterOf(finger: FingerName): number {
    return clamp01(safeTuning(finger).enter + this.enterOffset);
  }

  private exitOf(finger: FingerName): number {
    return clamp01(safeTuning(finger).exit + this.exitOffset);
  }

  private inFrame(x: number, y: number): boolean {
    const edge = FINGER_RECOGNITION.visibility.edge;
    return (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x > edge &&
      x < 1 - edge &&
      y > edge / 2 &&
      y < 1 - edge / 2
    );
  }

  private pushHistory(track: Track, qualified: boolean): void {
    track.history[track.historyIndex] = qualified ? 1 : 0;
    track.historyIndex = (track.historyIndex + 1) % track.history.length;
    track.historyFilled = Math.min(track.history.length, track.historyFilled + 1);
  }

  private openRatio(track: Track): number {
    if (track.historyFilled === 0) return 0;
    let open = 0;
    for (let i = 0; i < track.historyFilled; i += 1) open += track.history[i] ?? 0;
    return open / track.historyFilled;
  }

  private deactivate(track: Track): void {
    track.active = false;
    track.openRun = 0;
    track.closeRun = 0;
  }

  private handleMissing(now: number, out: FingerReadings): void {
    for (const finger of FINGER_NAMES) {
      const track = this.tracks.get(finger);
      if (!track) continue;
      track.score *= 0.85;
      track.confidence *= 0.8;
      track.jitter *= 0.9;
      this.deactivate(track);
      this.pushHistory(track, false);
      track.state = now > 0 && now - track.lastSeen < FINGER_RECOGNITION.timing.occludedMs ? "OCCLUDED" : "UNKNOWN";

      out[finger] = {
        finger,
        state: track.state,
        confidence: track.confidence,
        extension: track.score,
        active: false,
        visible: false,
        occluded: track.state === "OCCLUDED",
        unstable: false,
        x: track.lastX,
        y: track.lastY,
        anomaly: null,
        geometry: null,
      };
    }
  }

  private expectedRatios(): Partial<Record<FingerName, number>> | undefined {
    if (this.profile.sampleCount === 0) return undefined;
    if (this.expectedSamples !== this.profile.sampleCount || !this.expectedCache) {
      const next: Partial<Record<FingerName, number>> = {};
      for (const finger of FINGER_NAMES) {
        const ratio = this.profile.ratioFor(finger);
        if (ratio !== undefined) next[finger] = ratio;
      }
      this.expectedSamples = this.profile.sampleCount;
      this.expectedCache = next;
    }
    return this.expectedCache;
  }

  /**
   * An open, relaxed hand is the calibration pose: its measured proportions
   * become this performer's baseline. This happens in the background, so a
   * session never waits for a separate calibration step.
   */
  private maybeLearnProfile(analysis: HandAnalysis, now: number): void {
    if (now - this.lastObservedAt < FINGER_RECOGNITION.timing.calibrationIntervalMs) return;
    const fingers = FINGER_NAMES;
    for (const finger of fingers) {
      const geometry = analysis.fingers[finger];
      if (geometry.anomaly || geometry.score < 0.78) return;
    }
    this.lastObservedAt = now;
    const ratios: Partial<Record<FingerName, number>> = {};
    for (const finger of fingers) ratios[finger] = analysis.fingers[finger].extensionRatio;
    this.profile.absorb(ratios);
    this.expectedSamples = -1;
  }
}
