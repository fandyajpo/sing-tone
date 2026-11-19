import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { AudioEngine } from "../lib/audio-engine";
import { FingerClassifier } from "../lib/finger-classifier";
import type { FingerState } from "../lib/finger-classifier";
import { consumeRecalibrationRequest, publishFingerDebug } from "../lib/finger-debug";
import { projectPoint, projectionFor } from "../lib/hand-geometry";
import type { RenderFingertip } from "../lib/hand-renderer";
import { HandVisionRenderer } from "../lib/hand-renderer";
import { MovementAnalyzer } from "../lib/movement-analyzer";
import type { MoveSample } from "../lib/movement-analyzer";
import { frequencyFor, readPitch, type PitchWindow } from "../lib/pitch-mapping";
import { advanceVoiceState, createVoiceState, STILL_SPEED } from "../lib/pitch-state";
import type { PitchVoiceState } from "../lib/pitch-state";
import { FINGER_NAMES } from "../types/hand";
import type { FingerKey, HandFrame, HandSample } from "../types/hand";
import type { PitchSnapshot, PitchVoice } from "../types/pitch";
import { EMPTY_PITCH_SNAPSHOT } from "../types/pitch";

const MAX_FRAME_GAP_MS = 340;
const MIN_HAND_CONFIDENCE = 0.35;
/**
 * The readout is a display: 10 Hz is past the point where a musician can see
 * a difference, and it keeps the whole React tree off the 60 Hz path.
 */
const PUBLISH_INTERVAL_MS = 100;
const PULSE_MS = 420;

/** States worth drawing, mapped onto the three marker tones. */
const MARKER_TONE: Partial<Record<FingerState, "detected" | "unstable">> = {
  OPEN: "detected",
  PARTIALLY_OPEN: "detected",
  UNSTABLE: "unstable",
  OCCLUDED: "unstable",
};

const DEBUG_INTERVAL_MS = 90;

export interface UsePitchSynthParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<HandFrame>;
  audioRef: RefObject<AudioEngine | null>;
  window: PitchWindow;
  sensitivity: number;
  smoothing: number;
  responseMs: number;
  deadZone: number;
  instrument: string;
  enabled: boolean;
}

function handOf(hands: HandSample[], side: "left" | "right"): HandSample | null {
  const match = hands.find((hand) => hand.handedness === side);
  if (!match) return null;
  if (match.score > 0 && match.score < MIN_HAND_CONFIDENCE) return null;
  return match;
}

/**
 * Turns independently classified fingertips into continuous pitch voices.
 *
 * The classifier decides whether a finger may sound; the movement analyzer
 * reports how it is moving; the pitch state machine smooths Y and schedules
 * frequency ramps. Hidden, folded and occluded fingers never reach audio.
 */
export function usePitchSynth({
  canvasRef,
  frameRef,
  audioRef,
  window: pitchWindow,
  sensitivity,
  smoothing,
  responseMs,
  deadZone,
  instrument,
  enabled,
}: UsePitchSynthParams): { snapshot: PitchSnapshot } {
  const [snapshot, setSnapshot] = useState<PitchSnapshot>(EMPTY_PITCH_SNAPSHOT);

  const leftClassifierRef = useRef<FingerClassifier | null>(null);
  const rightClassifierRef = useRef<FingerClassifier | null>(null);
  if (!leftClassifierRef.current) leftClassifierRef.current = new FingerClassifier("left");
  if (!rightClassifierRef.current) rightClassifierRef.current = new FingerClassifier("right");

  const movementRef = useRef<MovementAnalyzer | null>(null);
  if (!movementRef.current) movementRef.current = new MovementAnalyzer();

  const rendererRef = useRef<HandVisionRenderer | null>(null);
  if (!rendererRef.current) rendererRef.current = new HandVisionRenderer();

  const feelRef = useRef({ window: pitchWindow, sensitivity, smoothing, responseMs, deadZone });
  feelRef.current = { window: pitchWindow, sensitivity, smoothing, responseMs, deadZone };

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const leftClassifier = leftClassifierRef.current;
    const rightClassifier = rightClassifierRef.current;
    const movement = movementRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !leftClassifier || !rightClassifier || !movement || !renderer) return;

    const states = new Map<FingerKey, PitchVoiceState>();
    let raf = 0;
    let last = performance.now();
    let lastPublish = 0;
    let lastDebug = 0;

    const releaseAll = () => {
      for (const key of states.keys()) audioRef.current?.pitchOff(key);
      states.clear();
      audioRef.current?.pitchReleaseAll();
      movement.reset();
      leftClassifier.reset();
      rightClassifier.reset();
    };

    const frameLoop = (now: number) => {
      raf = requestAnimationFrame(frameLoop);

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
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

      const feel = feelRef.current;
      const leftHand = handOf(hands, "left");
      const rightHand = handOf(hands, "right");
      leftClassifier.configure(feel.sensitivity, feel.smoothing);
      rightClassifier.configure(feel.sensitivity, feel.smoothing);
      if (consumeRecalibrationRequest()) {
        leftClassifier.recalibrate();
        rightClassifier.recalibrate();
      }
      const leftReadings = leftClassifier.update(leftHand, aspect, now);
      const rightReadings = rightClassifier.update(rightHand, aspect, now);

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

      const seen = new Set<FingerKey>();
      const moves = new Map<FingerKey, MoveSample>();
      const tips: RenderFingertip[] = [];

      for (const [hand, readings] of [
        [leftHand, leftReadings] as const,
        [rightHand, rightReadings] as const,
      ]) {
        if (!hand) continue;

        for (const finger of FINGER_NAMES) {
          const reading = readings[finger];
          if (!reading || !reading.visible) continue;

          const key = `${hand.handedness}:${finger}` as FingerKey;
          const move = movement.update(key, reading.x, reading.y, now);
          if (move) moves.set(key, move);
          const point = projectPoint(reading.x, reading.y, projection);
          const lean = move ? Math.max(-26, Math.min(26, move.vy * 26)) : 0;

          if (!reading.active) {
            const tone = MARKER_TONE[reading.state];
            if (tone) {
              tips.push({
                x: point.x,
                y: point.y,
                active: false,
                extension: reading.extension,
                label: null,
                pulse: 0,
                tone,
              });
            }
            continue;
          }

          seen.add(key);
          let state = states.get(key);

          if (!state) {
            state = createVoiceState(reading.y, feel, now);
            state.velocity = 0.72 + Math.min(0.24, (move?.speed ?? 0) * 0.2);
            states.set(key, state);
            audioRef.current?.pitchOn(key, state.midi, state.velocity);
            renderer.burst(point.x, point.y, 0.55);
          } else {
            const step = advanceVoiceState(state, reading.y, dt, feel, now);
            if (step.midiChanged) {
              audioRef.current?.pitchTo(key, state.midi, step.glide);
            }
          }

          const pitch = readPitch(state.midi);
          renderer.emit(point.x, point.y, dt);
          tips.push({
            x: point.x,
            y: point.y,
            active: true,
            extension: reading.extension,
            label: pitch.note,
            pulse: Math.max(0, 1 - (now - state.noteChangedAt) / PULSE_MS),
            tone: "active",
            lean,
          });
        }
      }

      // Voices whose finger left ACTIVE release independently.
      for (const key of [...states.keys()]) {
        if (seen.has(key)) continue;
        states.delete(key);
        audioRef.current?.pitchOff(key);
      }

      renderer.update(dt);
      renderer.draw(ctx, tips, width);

      if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
        lastPublish = now;
        const voices: PitchVoice[] = [];
        let lead: PitchVoice | null = null;

        for (const [key, state] of states) {
          const [hand, finger] = key.split(":") as [PitchVoice["hand"], string];
          const reading = readPitch(state.midi);
          const move = moves.get(key);
          const voice: PitchVoice = {
            key,
            finger,
            hand,
            phase: state.phase,
            state: "OPEN",
            movement: move?.direction ?? "stationary",
            movementSpeed: move?.speed ?? 0,
            midi: state.midi,
            note: reading.note,
            octave: reading.octave,
            hz: frequencyFor(state.midi),
            cents: reading.cents,
            direction: state.speed > STILL_SPEED ? 1 : state.speed < -STILL_SPEED ? -1 : 0,
            speed: state.speed,
            velocity: state.velocity,
          };
          voices.push(voice);
          if (!lead || Math.abs(voice.speed) > Math.abs(lead.speed)) lead = voice;
        }

        setSnapshot({ voices, lead, handsVisible: hands.length });
      }
    };

    raf = requestAnimationFrame(frameLoop);

    return () => {
      cancelAnimationFrame(raf);
      releaseAll();
      setSnapshot(EMPTY_PITCH_SNAPSHOT);
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };
    // `instrument` is a dependency so switching instruments rebuilds voices
    // with the new timbre instead of leaving stale nodes behind.
  }, [enabled, instrument, audioRef, canvasRef, frameRef]);

  return { snapshot };
}

