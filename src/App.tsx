import { useCallback, useMemo, useRef, useState } from "react";
import { AudioControls } from "./components/AudioControls/AudioControls";
import { CameraSelector } from "./components/CameraSelector/CameraSelector";
import { CameraView } from "./components/CameraView/CameraView";
import { GestureHud } from "./components/GestureHud/GestureHud";
import { GuidePanel } from "./components/GuidePanel/GuidePanel";
import type { PerformanceSettings } from "./components/GuidePanel/GuidePanel";
import { HandOverlay } from "./components/HandOverlay/HandOverlay";
import { InstrumentSelector } from "./components/InstrumentSelector/InstrumentSelector";
import { KeySelector } from "./components/KeySelector/KeySelector";
import { PianoRangeSelector } from "./components/PianoRangeSelector/PianoRangeSelector";
import { StartGate } from "./components/StartGate/StartGate";
import { TipsPanel } from "./components/TipsPanel/TipsPanel";
import { WaveformVisualizer } from "./components/WaveformVisualizer/WaveformVisualizer";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useCamera } from "./hooks/useCamera";
import { useGestureSynth } from "./hooks/useGestureSynth";
import { useHandTracking } from "./hooks/useHandTracking";
import { readStoredKey, storeKey } from "./lib/gesture-chords";
import type { KeyId } from "./lib/gesture-chords";
import type { LandmarkerOptions } from "./lib/mediapipe";
import { getPianoRange, readStoredPianoRange, storePianoRange } from "./lib/piano-ranges";
import type { PianoRangeId } from "./lib/piano-ranges";

const INITIAL_SETTINGS: PerformanceSettings = {
  sensitivity: 0.62,
  smoothing: 0.42,
  detectionConfidence: 0.5,
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const camera = useCamera(videoRef);
  const audio = useAudioEngine();

  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [settings, setSettings] = useState<PerformanceSettings>(INITIAL_SETTINGS);
  const [rangeId, setRangeId] = useState<PianoRangeId>(readStoredPianoRange);
  const [keyId, setKeyId] = useState<KeyId>(readStoredKey);

  const pianoRange = useMemo(() => getPianoRange(rangeId), [rangeId]);

  const changeRange = useCallback((next: PianoRangeId) => {
    setRangeId(next);
    storePianoRange(next);
  }, []);

  const changeKey = useCallback((next: KeyId) => {
    setKeyId(next);
    storeKey(next);
  }, []);

  const cameraReady = camera.status === "ready";
  const trackingEnabled = started && cameraReady;

  const landmarkerOptions = useMemo<LandmarkerOptions>(
    () => ({
      numHands: 2,
      minHandDetectionConfidence: settings.detectionConfidence,
      minHandPresenceConfidence: Math.max(0.3, settings.detectionConfidence - 0.1),
      minTrackingConfidence: Math.max(0.3, settings.detectionConfidence - 0.1),
    }),
    [settings.detectionConfidence],
  );

  const tracking = useHandTracking(videoRef, trackingEnabled, landmarkerOptions);

  const gesture = useGestureSynth({
    canvasRef,
    frameRef: tracking.frameRef,
    audioRef: audio.engineRef,
    keyId,
    baseOctave: pianoRange.baseOctave,
    sensitivity: settings.sensitivity,
    smoothing: settings.smoothing,
    enabled: trackingEnabled && tracking.status === "ready",
  });

  const handleStart = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    // Audio must be unlocked inside the click gesture, so start it first and
    // let the camera request run in parallel.
    const audioPromise = audio.start();
    const cameraOk = await camera.start();
    await audioPromise;
    if (cameraOk) setStarted(true);
    setStarting(false);
  }, [audio, camera, starting]);

  const updateSettings = useCallback((patch: Partial<PerformanceSettings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const openGuide = useCallback(() => setGuideOpen(true), []);
  const closeGuide = useCallback(() => setGuideOpen(false), []);

  const cameraFaulted =
    started && camera.status !== "ready" && camera.status !== "requesting";
  const chordActive = gesture.snapshot.chordName !== null;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-paper text-ink select-none">
      <CameraView
        videoRef={videoRef}
        status={camera.status}
        trackingReady={tracking.status === "ready"}
        handsVisible={gesture.handsVisible}
        chordActive={chordActive}
      />

      <HandOverlay canvasRef={canvasRef} />
      <WaveformVisualizer audioRef={audio.engineRef} />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-col gap-2 p-2.5 sm:flex-row sm:items-start sm:justify-between sm:p-4">
        <div className="pointer-events-auto flex flex-wrap items-start gap-2">
          <CameraSelector
            devices={camera.devices}
            deviceId={camera.deviceId}
            onSelect={(deviceId) => {
              if (deviceId) void camera.selectDevice(deviceId);
            }}
          />
          <InstrumentSelector instrument={audio.instrument} onSelect={audio.selectInstrument} />
          <KeySelector keyId={keyId} onChange={changeKey} />
          <PianoRangeSelector range={pianoRange} onChange={changeRange} />
          <button
            type="button"
            onClick={openGuide}
            className="panel flex items-center gap-2 px-3 py-3 text-[9px] uppercase tracking-[0.24em] text-ink-soft transition-colors duration-200 hover:text-ink"
          >
            <span className="grid h-4 w-4 place-items-center rounded-full border border-ink/20 text-[9px] leading-none">
              ?
            </span>
            Guide
          </button>
        </div>

        <div className="pointer-events-auto self-end sm:self-auto">
          <AudioControls
            status={audio.status}
            volume={audio.volume}
            muted={audio.muted}
            usingFallback={audio.usingFallback}
            engineRef={audio.engineRef}
            onVolumeChange={audio.changeVolume}
            onToggleMute={audio.toggleMute}
            onEnableAudio={() => {
              void audio.start();
            }}
          />
        </div>
      </header>

      <div className="pointer-events-none absolute left-1/2 top-3 z-30 hidden -translate-x-1/2 items-center gap-2.5 font-mono text-[8px] uppercase tracking-[0.28em] text-ink-faint lg:flex">
        <span>
          {gesture.handsVisible} {gesture.handsVisible === 1 ? "hand" : "hands"}
        </span>
        <span className="h-[3px] w-[3px] rounded-full bg-ink/20" />
        <span>{tracking.stats.fps} fps</span>
        <span className="h-[3px] w-[3px] rounded-full bg-ink/20" />
        <span>{audio.instrument}</span>
      </div>

      {started && tracking.status === "loading" && (
        <div className="panel-quiet absolute left-1/2 top-16 z-40 -translate-x-1/2 px-3 py-1.5 text-[9px] uppercase tracking-[0.26em] text-ink-soft">
          initialising hand tracking…
        </div>
      )}

      {tracking.status === "error" && (
        <div className="panel absolute left-1/2 top-16 z-40 w-[min(92vw,22rem)] -translate-x-1/2 px-4 py-3 text-center">
          <p className="text-[9px] uppercase tracking-[0.26em] text-magenta">tracking stopped</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{tracking.error}</p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 z-30" style={{ bottom: 74 }}>
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-2 px-2.5 sm:px-4">
          <div className="hidden justify-end lg:flex">
            <div className="pointer-events-auto">
              <TipsPanel
                handsVisible={gesture.handsVisible}
                chordActive={chordActive}
                audioReady={audio.status === "ready"}
              />
            </div>
          </div>
          <GestureHud keyId={keyId} snapshot={gesture.snapshot} />
        </div>
      </div>

      <GuidePanel
        open={guideOpen}
        onClose={closeGuide}
        settings={settings}
        onChange={updateSettings}
        audioReady={audio.status === "ready"}
        audioError={audio.error}
        onEnableAudio={() => {
          void audio.start();
        }}
        trackingError={tracking.error}
      />

      {cameraFaulted && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#060508]/70 p-6 backdrop-blur-sm">
          <div className="panel max-w-sm px-5 py-5 text-center">
            <p className="text-[9px] uppercase tracking-[0.3em] text-magenta">
              camera disconnected
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">{camera.error}</p>
            <button
              type="button"
              onClick={handleStart}
              className="mt-4 w-full rounded-full border border-gold/40 bg-gold/10 px-4 py-2.5 text-[9px] uppercase tracking-[0.28em] text-gold transition hover:bg-gold/15"
            >
              {starting ? "reconnecting…" : "reconnect camera"}
            </button>
          </div>
        </div>
      )}

      {!started && <StartGate starting={starting} error={camera.error} onStart={handleStart} />}
    </main>
  );
}
