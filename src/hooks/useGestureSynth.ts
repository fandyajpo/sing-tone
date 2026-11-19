import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { AudioEngine } from "../lib/audio-engine";
import {
  chordFor,
  type Chord,
  type ChordMode,
  type ChordVoicing,
  type KeyId,
} from "../lib/gesture-chords";
import {
  GestureHandTracker,
  degreeFromPose,
  modeFromPose,
  octaveShiftFromPose,
  voicingFromPose,
} from "../lib/gesture-poses";
import { FingerClassifier } from "../lib/finger-classifier";
import { consumeRecalibrationRequest, publishFingerDebug } from "../lib/finger-debug";
import { fingertipsOf, pointAt, projectPoint, projectionFor } from "../lib/hand-geometry";
import { HandVisionRenderer } from "../lib/hand-renderer";
import type { RenderFingertip } from "../lib/hand-renderer";
import { FINGER_NAMES } from "../types/hand";
import type { HandFrame, HandSample } from "../types/hand";
import type { PianoNote } from "../types/piano";

export interface GestureSnapshot {
  chordName: string | null;
  chordNotes: PianoNote[];
  degree: number | null;
  voicing: ChordVoicing | null;
  mode: ChordMode;
  octaveShift: number;
  leftPresent: boolean;
  rightPresent: boolean;
}

export const EMPTY_GESTURE_SNAPSHOT: GestureSnapshot = {
  chordName: null,
  chordNotes: [],
  degree: null,
  voicing: null,
  mode: "diatonic",
  octaveShift: 0,
  leftPresent: false,
  rightPresent: false,
};

export interface UseGestureSynthParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HandFrame>;
  audioRef: RefObject<AudioEngine | null>;
  keyId: KeyId;
  baseOctave: number;
  sensitivity: number;
  smoothing: number;
  enabled: boolean;
}

export interface UseGestureSynthResult {
  snapshot: GestureSnapshot;
  handsVisible: number;
}

const MAX_FRAME_GAP_MS = 340;
/** A chord has to hold this long before it replaces the sounding one. */
const CHORD_SETTLE_MS = 120;
/** Grace period so a single dropped detection does not cut the chord. */
const MUTE_GRACE_MS = 190;
const PULSE_MS = 700;
const MIN_HAND_CONFIDENCE = 0.35;
const DEBUG_INTERVAL_MS = 90;

function handOf(hands: HandSample[], side: "left" | "right"): HandSample | null {
  const match = hands.find((hand) => hand.handedness === side);
  if (!match) return null;
  if (match.score > 0 && match.score < MIN_HAND_CONFIDENCE) return null;
  return match;
}

/**
 * Turns both hand poses into chords. Left hand picks the degree and the
 * major/minor tilt, right hand picks the voicing and the octave. A chord is
 * only retriggered when its identity changes and the pose has settled, so
 * tracking jitter never machine-guns notes.
 */
export function useGestureSynth({
  canvasRef,
  frameRef,
  audioRef,
  keyId,
  baseOctave,
  sensitivity,
  smoothing,
  enabled,
}: UseGestureSynthParams): UseGestureSynthResult {
  const [snapshot, setSnapshot] = useState<GestureSnapshot>(EMPTY_GESTURE_SNAPSHOT);
  const [handsVisible, setHandsVisible] = useState(0);

  const leftTrackerRef = useRef<GestureHandTracker | null>(null);
  const rightTrackerRef = useRef<GestureHandTracker | null>(null);
  if (!leftTrackerRef.current) leftTrackerRef.current = new GestureHandTracker();
  if (!rightTrackerRef.current) rightTrackerRef.current = new GestureHandTracker();

  const leftClassifierRef = useRef<FingerClassifier | null>(null);
  const rightClassifierRef = useRef<FingerClassifier | null>(null);
  if (!leftClassifierRef.current) leftClassifierRef.current = new FingerClassifier("left");
  if (!rightClassifierRef.current) rightClassifierRef.current = new FingerClassifier("right");

  const rendererRef = useRef<HandVisionRenderer | null>(null);
  if (!rendererRef.current) rendererRef.current = new HandVisionRenderer();

  const keyRef = useRef(keyId);
  keyRef.current = keyId;
  const octaveRef = useRef(baseOctave);
  octaveRef.current = baseOctave;
  const feelRef = useRef({ sensitivity, smoothing });
  feelRef.current = { sensitivity, smoothing };

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const leftTracker = leftTrackerRef.current;
    const rightTracker = rightTrackerRef.current;
    const renderer = rendererRef.current;
    const leftClassifier = leftClassifierRef.current;
    const rightClassifier = rightClassifierRef.current;
    if (!canvas || !leftTracker || !rightTracker || !renderer) return;
    if (!leftClassifier || !rightClassifier) return;

    let raf = 0;
    let last = performance.now();
    let lastDebug = 0;
    let active: { id: string; name: string; notes: PianoNote[] } | null = null;
    let pending: { chord: Chord; since: number; velocity: number } | null = null;
    let lastVoicing: ChordVoicing = "root";
    let lastShift = 0;
    let lastChordAt = 0;
    let lastBrightness = -1;
    let pulseAt = -PULSE_MS;
    let signature = "";
    let knownHands = -1;

    const release = () => {
      if (!active) return;
      for (const note of active.notes) audioRef.current?.noteOff(note);
      active = null;
    };

    const attack = (chord: Chord, velocity: number) => {
      release();
      for (const note of chord.notes) audioRef.current?.noteOn(note, velocity);
      active = { id: chord.id, name: chord.name, notes: chord.notes };
      pulseAt = performance.now();
    };

    const frameLoop = (now: number) => {
      raf = requestAnimationFrame(frameLoop);

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dt = Math.min(0.06, Math.max(0.001, (now - last) / 1000));
      last = now;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const frame = frameRef.current;
      const fresh = frame.timestamp > 0 && now - frame.timestamp < MAX_FRAME_GAP_MS;
      const hands = fresh ? frame.hands : [];
      const projection = projectionFor(frame.videoWidth, frame.videoHeight, width, height);
      const aspect =
        frame.videoWidth > 0 && frame.videoHeight > 0
          ? frame.videoWidth / frame.videoHeight
          : 16 / 9;

      const leftHand = handOf(hands, "left");
      const rightHand = handOf(hands, "right");
      const feel = feelRef.current;
      leftClassifier.configure(feel.sensitivity, feel.smoothing);
      rightClassifier.configure(feel.sensitivity, feel.smoothing);
      if (consumeRecalibrationRequest()) {
        leftClassifier.recalibrate();
        rightClassifier.recalibrate();
      }
      const leftReadings = leftClassifier.update(leftHand, aspect, now);
      const rightReadings = rightClassifier.update(rightHand, aspect, now);
      const leftPose = leftTracker.update(leftHand, leftReadings, aspect);
      const rightPose = rightTracker.update(rightHand, rightReadings, aspect);

      if (import.meta.env.DEV && now - lastDebug >= DEBUG_INTERVAL_MS) {
        lastDebug = now;
        publishFingerDebug(
          [
            {
              hand: "left",
              present: leftHand !== null,
              profileSamples: leftClassifier.profileSamples,
              readings: FINGER_NAMES.map((finger) => leftReadings[finger]),
            },
            {
              hand: "right",
              present: rightHand !== null,
              profileSamples: rightClassifier.profileSamples,
              readings: FINGER_NAMES.map((finger) => rightReadings[finger]),
            },
          ],
          now,
        );
      }

      const degree = degreeFromPose(leftPose);
      const mode = modeFromPose(leftPose);
      const detectedVoicing = voicingFromPose(rightPose);
      if (detectedVoicing) lastVoicing = detectedVoicing;
      // Dropping the right hand keeps the current voicing and octave, so
      // changing hands never transposes the chord under your fingers.
      if (rightPose.present) lastShift = octaveShiftFromPose(rightPose);
      const shift = lastShift;

      let target: Chord | null = null;
      if (degree !== null) {
        target = chordFor({
          keyId: keyRef.current,
          degree,
          mode,
          voicing: lastVoicing,
          baseOctave: octaveRef.current,
          octaveShift: shift,
        });
      }

      const handHeight = rightPose.present ? rightPose.height : 0.55;
      // A higher floor keeps the chords full instead of whisper-quiet.
      const velocity = 0.65 + handHeight * 0.35;

      if (Math.abs(handHeight - lastBrightness) > 0.02) {
        lastBrightness = handHeight;
        audioRef.current?.setBrightness(handHeight);
      }

      if (!target) {
        pending = null;
        if (active && now - lastChordAt > MUTE_GRACE_MS) release();
      } else {
        lastChordAt = now;
        if (!active || active.id !== target.id) {
          if (!pending || pending.chord.id !== target.id) {
            pending = { chord: target, since: now, velocity };
          } else if (now - pending.since >= CHORD_SETTLE_MS) {
            attack(pending.chord, pending.velocity);
            pending = null;
          }
        } else {
          pending = null;
        }
      }

      const pulse = Math.max(0, 1 - (now - pulseAt) / PULSE_MS);
      const tips: RenderFingertip[] = [];

      for (const [hand, pose] of [
        [leftHand, leftPose] as const,
        [rightHand, rightPose] as const,
      ]) {
        if (!hand || !pose.present) continue;
        for (const tip of fingertipsOf(hand)) {
          if (!pose.extended[tip.finger]) continue;
          const point = projectPoint(tip.x, tip.y, projection);
          if (active) renderer.emit(point.x, point.y, dt);
          tips.push({
            x: point.x,
            y: point.y,
            active: active !== null,
            extension: 1,
            label: null,
            pulse,
          });
        }
      }

      if (pulse > 0.92 && active) {
        const anchor = leftHand ?? rightHand;
        if (anchor) {
          const wrist = pointAt(anchor.landmarks, 0);
          const point = projectPoint(1 - wrist.x, wrist.y, projection);
          renderer.burst(point.x, point.y, 0.7);
        }
      }

      renderer.update(dt);
      renderer.draw(ctx, tips, width);

      const nextSignature = [
        active ? active.id : "",
        degree === null ? "" : String(degree),
        detectedVoicing ?? lastVoicing,
        mode,
        String(shift),
        leftPose.present ? "L" : "",
        rightPose.present ? "R" : "",
      ].join("|");

      if (nextSignature !== signature) {
        signature = nextSignature;
        setSnapshot({
          chordName: active ? active.name : null,
          chordNotes: active ? active.notes : [],
          degree,
          voicing: detectedVoicing ?? lastVoicing,
          mode,
          octaveShift: shift,
          leftPresent: leftPose.present,
          rightPresent: rightPose.present,
        });
      }

      if (hands.length !== knownHands) {
        knownHands = hands.length;
        setHandsVisible(hands.length);
      }
    };

    raf = requestAnimationFrame(frameLoop);

    return () => {
      cancelAnimationFrame(raf);
      release();
      audioRef.current?.releaseAll();
      signature = "";
      setSnapshot(EMPTY_GESTURE_SNAPSHOT);
      setHandsVisible(0);
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [enabled, audioRef, canvasRef, frameRef]);

  return { snapshot, handsVisible };
}
