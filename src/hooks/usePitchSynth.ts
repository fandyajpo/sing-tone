import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { AudioEngine } from "../lib/audio-engine";
import { GestureHandTracker } from "../lib/gesture-poses";
import { fingertipsOf, projectPoint, projectionFor } from "../lib/hand-geometry";
import type { RenderFingertip } from "../lib/hand-renderer";
import { HandVisionRenderer } from "../lib/hand-renderer";
import { frequencyFor, readPitch, type PitchWindow } from "../lib/pitch-mapping";
import { advanceVoiceState, createVoiceState, STILL_SPEED } from "../lib/pitch-state";
import type { PitchVoiceState } from "../lib/pitch-state";
import type { FingerKey, HandFrame, HandSample } from "../types/hand";
import type { PitchSnapshot, PitchVoice } from "../types/pitch";
import { EMPTY_PITCH_SNAPSHOT } from "../types/pitch";

const MAX_FRAME_GAP_MS = 340;
const MIN_HAND_CONFIDENCE = 0.35;
const PUBLISH_INTERVAL_MS = 45;
const PULSE_MS = 420;

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
 * Turns extended fingertips into continuous pitch voices.
 *
 * Y is smoothed exponentially, a dead zone keeps a held finger from drifting,
 * and each fingertip owns an independent voice whose frequency is ramped — so
 * moving one finger never touches another finger's pitch.
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

  const leftTrackerRef = useRef<GestureHandTracker | null>(null);
  const rightTrackerRef = useRef<GestureHandTracker | null>(null);
  if (!leftTrackerRef.current) leftTrackerRef.current = new GestureHandTracker();
  if (!rightTrackerRef.current) rightTrackerRef.current = new GestureHandTracker();

  const rendererRef = useRef<HandVisionRenderer | null>(null);
  if (!rendererRef.current) rendererRef.current = new HandVisionRenderer();

  const feelRef = useRef({ window: pitchWindow, sensitivity, smoothing, responseMs, deadZone });
  feelRef.current = { window: pitchWindow, sensitivity, smoothing, responseMs, deadZone };

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const leftTracker = leftTrackerRef.current;
    const rightTracker = rightTrackerRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !leftTracker || !rightTracker || !renderer) return;

    const states = new Map<FingerKey, PitchVoiceState>();
    let raf = 0;
    let last = performance.now();
    let lastPublish = 0;

    const releaseAll = () => {
      for (const key of states.keys()) audioRef.current?.pitchOff(key);
      states.clear();
      audioRef.current?.pitchReleaseAll();
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
      leftTracker.configure(feel.sensitivity, feel.smoothing);
      rightTracker.configure(feel.sensitivity, feel.smoothing);
      const leftPose = leftTracker.update(leftHand, aspect, now);
      const rightPose = rightTracker.update(rightHand, aspect, now);

      const seen = new Set<FingerKey>();
      const tips: RenderFingertip[] = [];

      for (const [hand, pose] of [
        [leftHand, leftPose] as const,
        [rightHand, rightPose] as const,
      ]) {
        if (!hand || !pose.present) continue;

        for (const tip of fingertipsOf(hand)) {
          if (!pose.extended[tip.finger]) continue;
          seen.add(tip.key);

          let state = states.get(tip.key);

          if (!state) {
            state = createVoiceState(tip.y, feel, now);
            states.set(tip.key, state);
            audioRef.current?.pitchOn(tip.key, state.midi, state.velocity);
            const point = projectPoint(tip.x, tip.y, projection);
            renderer.burst(point.x, point.y, 0.55);
          } else {
            const step = advanceVoiceState(state, tip.y, dt, feel, now);
            if (step.midiChanged) {
              audioRef.current?.pitchTo(tip.key, state.midi, step.glide);
            }
          }

          state.lastY = tip.y;

          const reading = readPitch(state.midi);
          const point = projectPoint(tip.x, tip.y, projection);
          renderer.emit(point.x, point.y, dt);
          tips.push({
            x: point.x,
            y: point.y,
            active: true,
            extension: 1,
            label: reading.note,
            pulse: Math.max(0, 1 - (now - state.noteChangedAt) / PULSE_MS),
          });
        }
      }

      // Folded fingers, hidden hands and lost tracking release their own voice.
      for (const key of [...states.keys()]) {
        if (seen.has(key)) continue;
        states.delete(key);
        audioRef.current?.pitchOff(key);
      }

      renderer.update(dt);
      renderer.draw(ctx, tips, width);

      const count = hands.length;

      if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
        lastPublish = now;
        const voices: PitchVoice[] = [];
        let lead: PitchVoice | null = null;

        for (const [key, state] of states) {
          const [hand, finger] = key.split(":") as [PitchVoice["hand"], string];
          const reading = readPitch(state.midi);
          const voice: PitchVoice = {
            key,
            finger,
            hand,
            phase: state.phase,
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

        setSnapshot({ voices, lead, handsVisible: count });
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
