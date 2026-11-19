import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioControls } from "./components/AudioControls/AudioControls";
import { SettingsSheet } from "./components/BottomSheet/SettingsSheet";
import { CameraSelector } from "./components/CameraSelector/CameraSelector";
import { CameraView } from "./components/CameraView/CameraView";
import { FingerDebugOverlay } from "./components/FingerDebug/FingerDebugOverlay";
import { GestureHud } from "./components/GestureHud/GestureHud";
import { GuidePanel } from "./components/GuidePanel/GuidePanel";
import type { PerformanceSettings } from "./components/GuidePanel/GuidePanel";
import { HandOverlay } from "./components/HandOverlay/HandOverlay";
import { InitializationScreen } from "./components/InitializationScreen/InitializationScreen";
import type { InitStageKey } from "./components/InitializationScreen/InitializationScreen";
import { InstrumentSelector } from "./components/InstrumentSelector/InstrumentSelector";
import { KeySelector } from "./components/KeySelector/KeySelector";
import { PianoRangeSelector } from "./components/PianoRangeSelector/PianoRangeSelector";
import { PitchMeter } from "./components/PitchMeter/PitchMeter";
import { StartGate } from "./components/StartGate/StartGate";
import { TipsPanel } from "./components/TipsPanel/TipsPanel";
import { Button } from "./components/ui/Button";
import { WaveformVisualizer } from "./components/WaveformVisualizer/WaveformVisualizer";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useCamera } from "./hooks/useCamera";
import { useGestureSynth } from "./hooks/useGestureSynth";
import { useHandTracking } from "./hooks/useHandTracking";
import { usePitchSynth } from "./hooks/usePitchSynth";
import { useSnapshotUpload } from "./hooks/useSnapshotUpload";
import { readStoredKey, storeKey } from "./lib/gesture-chords";
import type { KeyId } from "./lib/gesture-chords";
import type { LandmarkerOptions } from "./lib/mediapipe";
import {
  getPianoRange,
  readStoredPianoRange,
  storePianoRange,
} from "./lib/piano-ranges";
import type { PianoRangeId } from "./lib/piano-ranges";
import { clampWindow, windowForBendRange } from "./lib/pitch-mapping";
import { readStoredMode, storeMode } from "./lib/play-mode";
import type { PlayMode } from "./lib/play-mode";
import { noteToMidi } from "./types/piano";

const INITIAL_SETTINGS: PerformanceSettings = {
  sensitivity: 0.62,
  smoothing: 0.42,
  detectionConfidence: 0.5,
  pitchBendRange: 24,
  pitchLowMidi: 48,
  pitchHighMidi: 71,
  pitchResponseMs: 110,
  pitchDeadZone: 0.0035,
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const camera = useCamera(videoRef);
  const audio = useAudioEngine();

  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [snapshotConsent, setSnapshotConsent] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [settings, setSettings] =
    useState<PerformanceSettings>(INITIAL_SETTINGS);
  const [rangeId, setRangeId] = useState<PianoRangeId>(readStoredPianoRange);
  const [keyId, setKeyId] = useState<KeyId>(readStoredKey);
  const [mode, setMode] = useState<PlayMode>(readStoredMode);
  const [trackingToken, setTrackingToken] = useState(0);

  const pianoRange = useMemo(() => getPianoRange(rangeId), [rangeId]);
  const rangeLowMidi = useMemo(
    () => noteToMidi(pianoRange.lowest),
    [pianoRange],
  );
  const rangeHighMidi = useMemo(
    () => noteToMidi(pianoRange.highest),
    [pianoRange],
  );

  const pitchWindow = useMemo(
    () =>
      clampWindow(
        settings.pitchLowMidi,
        settings.pitchHighMidi,
        rangeLowMidi,
        rangeHighMidi,
      ),
    [
      settings.pitchLowMidi,
      settings.pitchHighMidi,
      rangeLowMidi,
      rangeHighMidi,
    ],
  );

  // The selected note range owns the pitch boundaries.
  useEffect(() => {
    setSettings((previous) => {
      const next = windowForBendRange(
        rangeLowMidi,
        rangeHighMidi,
        previous.pitchBendRange,
      );
      if (
        previous.pitchLowMidi === next.low &&
        previous.pitchHighMidi === next.high
      ) {
        return previous;
      }
      return { ...previous, pitchLowMidi: next.low, pitchHighMidi: next.high };
    });
  }, [rangeLowMidi, rangeHighMidi]);

  const changeRange = useCallback((next: PianoRangeId) => {
    setRangeId(next);
    storePianoRange(next);
  }, []);

  const changeKey = useCallback((next: KeyId) => {
    setKeyId(next);
    storeKey(next);
  }, []);

  const changeMode = useCallback((next: PlayMode) => {
    setMode(next);
    storeMode(next);
  }, []);

  const cameraReady = camera.status === "ready";
  const trackingEnabled = started && cameraReady;

  const landmarkerOptions = useMemo<LandmarkerOptions>(
    () => ({
      numHands: 2,
      minHandDetectionConfidence: settings.detectionConfidence,
      minHandPresenceConfidence: Math.max(
        0.3,
        settings.detectionConfidence - 0.1,
      ),
      minTrackingConfidence: Math.max(0.3, settings.detectionConfidence - 0.1),
    }),
    [settings.detectionConfidence],
  );

  const tracking = useHandTracking(
    videoRef,
    trackingEnabled,
    landmarkerOptions,
    trackingToken,
  );
  // "ready" status only means the model exists; calibration must finish before
  // fingertips are allowed to make sound.
  const trackingLive =
    trackingEnabled &&
    tracking.status === "ready" &&
    tracking.stage === "ready";
  const chordMode = mode === "chords";

  const gesture = useGestureSynth({
    canvasRef,
    frameRef: tracking.frameRef,
    audioRef: audio.engineRef,
    keyId,
    baseOctave: pianoRange.baseOctave,
    sensitivity: settings.sensitivity,
    smoothing: settings.smoothing,
    enabled: chordMode && trackingLive,
  });

  const pitch = usePitchSynth({
    canvasRef,
    frameRef: tracking.frameRef,
    audioRef: audio.engineRef,
    window: pitchWindow,
    sensitivity: settings.sensitivity,
    smoothing: settings.smoothing,
    responseMs: settings.pitchResponseMs,
    deadZone: settings.pitchDeadZone,
    instrument: audio.instrument,
    enabled: mode === "pitch" && trackingLive,
  });

  const snapshot = useSnapshotUpload(
    videoRef,
    started && cameraReady && snapshotConsent,
  );

  // const changeSnapshotConsent = useCallback((next: boolean) => {
  //   setSnapshotConsent(next);
  // }, []);

  const handleStart = useCallback(
    async (allowSnapshotUploads = false) => {
      if (starting) return;
      setStarting(true);
      if (allowSnapshotUploads) setSnapshotConsent(true);
      // Audio must be unlocked inside the click gesture, so start it first and
      // let the camera request run in parallel.
      const audioPromise = audio.start();
      const cameraOk = await camera.start();
      await audioPromise;
      if (cameraOk) setStarted(true);
      else if (allowSnapshotUploads) setSnapshotConsent(false);
      setStarting(false);
    },
    [audio, camera, starting],
  );

  const updateSettings = useCallback(
    (patch: Partial<PerformanceSettings>) => {
      setSettings((previous) => {
        const merged = { ...previous, ...patch };
        if (patch.pitchBendRange !== undefined) {
          const next = windowForBendRange(
            rangeLowMidi,
            rangeHighMidi,
            merged.pitchBendRange,
          );
          merged.pitchLowMidi = next.low;
          merged.pitchHighMidi = next.high;
        }
        if (merged.pitchLowMidi > merged.pitchHighMidi - 12) {
          merged.pitchLowMidi = merged.pitchHighMidi - 12;
        }
        return merged;
      });
    },
    [rangeLowMidi, rangeHighMidi],
  );

  const openGuide = useCallback(() => setGuideOpen(true), []);
  const closeGuide = useCallback(() => setGuideOpen(false), []);

  const initError =
    camera.status === "denied" ||
    camera.status === "unavailable" ||
    camera.status === "error"
      ? camera.error
      : tracking.status === "error"
        ? tracking.error
        : null;

  const initStage: InitStageKey = initError
    ? "error"
    : camera.status === "requesting"
      ? "permission"
      : tracking.stage === "loading-engine"
        ? "engine"
        : tracking.stage === "loading-model"
          ? "model"
          : tracking.stage === "calibrating"
            ? "calibrating"
            : tracking.stage === "ready"
              ? "ready"
              : "preparing";

  const retryInitialization = useCallback(() => {
    setTrackingToken((token) => token + 1);
    if (camera.status === "ready") return;
    void handleStart();
  }, [camera.status, handleStart]);

  const showInitialization =
    starting || (started && tracking.stage !== "ready");

  const cameraFaulted =
    started && camera.status !== "ready" && camera.status !== "requesting";
  const chordActive = chordMode && gesture.snapshot.chordName !== null;
  const handsVisible = Math.max(
    gesture.handsVisible,
    pitch.snapshot.handsVisible,
  );
  const voiceCount = pitch.snapshot.voices.length;

  const hud = chordMode ? (
    <GestureHud keyId={keyId} snapshot={gesture.snapshot} />
  ) : (
    <PitchMeter window={pitchWindow} snapshot={pitch.snapshot} />
  );

  // const snapshotLabel = !snapshotConsent
  //   ? "off"
  //   : snapshot.status === "waiting"
  //     ? "every 10s"
  //     : snapshot.status === "capturing"
  //       ? "capturing"
  //       : snapshot.status === "uploading"
  //         ? "sending"
  //         : snapshot.status === "sent"
  //           ? "sent"
  //           : snapshot.status === "limited"
  //             ? "rate limited"
  //             : snapshot.status === "failed"
  //               ? "failed"
  //               : "starting";

  const sessionPanel = (
    <div className="panel tone-mint flex flex-col gap-1 px-3 py-2">
      <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-gold">
        Session
      </span>
      <div className="flex items-center justify-between font-mono text-[10px] text-ink-soft">
        <span>hands</span>
        <span className="text-ink">{handsVisible}</span>
      </div>
      <div className="flex items-center justify-between font-mono text-[10px] text-ink-soft">
        <span>tracking</span>
        <span className="text-ink">{tracking.stats.fps} fps</span>
      </div>
      {!chordMode && (
        <div className="flex items-center justify-between font-mono text-[10px] text-ink-soft">
          <span>voices</span>
          <span className="text-ink">{voiceCount}</span>
        </div>
      )}
      {/* <div className="flex items-center justify-between font-mono text-[10px] text-ink-soft">
        <span>Discord snapshots</span>
        <span
          className={
            snapshot.status === "failed" || snapshot.status === "limited"
              ? "text-ember"
              : "text-ink"
          }
        >
          {snapshotLabel}
        </span>
      </div> */}
      {snapshot.message &&
        (snapshot.status === "failed" || snapshot.status === "limited") && (
          <p role="status" className="text-[9px] leading-snug text-ember">
            {snapshot.message}
          </p>
        )}
      {/* <p className="mt-1 text-[9px] leading-snug text-ink-faint">
        {snapshotConsent
          ? "One still frame is sent to Discord every 10 seconds, up to 12 per day."
          : "Camera frames stay inside this tab unless you opt in to snapshots."}
      </p> */}
    </div>
  );

  const modeButtons = (
    <div className="flex gap-1.5">
      <Button
        size="sm"
        variant={chordMode ? "solid" : "outline"}
        aria-pressed={chordMode}
        onClick={() => changeMode("chords")}
      >
        Chords
      </Button>
      <Button
        size="sm"
        variant={chordMode ? "outline" : "solid"}
        aria-pressed={!chordMode}
        onClick={() => changeMode("pitch")}
      >
        Pitch
      </Button>
    </div>
  );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-paper text-ink select-none lg:flex lg:gap-2 lg:p-2">
      {/* Desktop left rail */}
      <aside className="scroll-thin hidden w-[226px] shrink-0 flex-col gap-2 lg:flex lg:overflow-y-auto">
        <div className="flex items-start justify-between gap-2 border-b-2 border-edge px-1 pb-2">
          <div>
            <p className="font-display text-[18px] font-bold uppercase leading-[0.84] tracking-[-0.02em] text-ink">
              Sing
              <br />
              Tone
            </p>
            <p className="mt-1.5 font-mono text-[7.5px] uppercase tracking-[0.18em] text-ink-faint">
              gesture chord synth / 01
            </p>
          </div>
          <Button size="sm" variant="quiet" onClick={openGuide}>
            Guide
          </Button>
        </div>

        <div className="panel tone-coral flex flex-col gap-1.5 px-2.5 py-2">
          <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-gold">
            Mode
          </span>
          {modeButtons}
          <span className="text-[10px] leading-snug text-ink-faint">
            {chordMode
              ? "Left hand picks the degree, right hand the voicing."
              : "Each fingertip bends its own continuous pitch."}
          </span>
        </div>

        <InstrumentSelector
          instrument={audio.instrument}
          onSelect={audio.selectInstrument}
        />
        {chordMode ? (
          <>
            <KeySelector keyId={keyId} onChange={changeKey} />
            <PianoRangeSelector range={pianoRange} onChange={changeRange} />
          </>
        ) : (
          <>
            <PianoRangeSelector range={pianoRange} onChange={changeRange} />
            <div className="panel tone-tangerine flex flex-col gap-1 px-2.5 py-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-gold">
                Pitch window
              </span>
              <span className="font-mono text-[11px] text-ink">
                {pitchWindow.low} → {pitchWindow.high} midi
              </span>
              <span className="text-[10px] leading-snug text-ink-faint">
                {rangeHighMidi - rangeLowMidi} semitones in {pianoRange.label}
              </span>
            </div>
          </>
        )}
        <CameraSelector
          devices={camera.devices}
          deviceId={camera.deviceId}
          onSelect={(deviceId) => {
            if (deviceId) void camera.selectDevice(deviceId);
          }}
        />
        {sessionPanel}
      </aside>

      {/* Stage: fullscreen camera on phones, centre column on desktop */}
      <section className="absolute inset-0 lg:static lg:order-2 lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-2">
        <div className="relative h-full overflow-hidden bg-paper lg:flex-1 lg:rounded-[9px] lg:border-2 lg:border-edge lg:shadow-[4px_4px_0_var(--color-edge)]">
          <CameraView
            videoRef={videoRef}
            status={camera.status}
            trackingReady={tracking.status === "ready"}
            handsVisible={handsVisible}
            chordActive={chordActive}
            mode={mode}
          />

          <HandOverlay canvasRef={canvasRef} />
          <WaveformVisualizer audioRef={audio.engineRef} />

          <div className="pointer-events-none absolute left-3 top-3 z-20 hidden items-center gap-2 rounded-[3px] border-2 border-edge bg-paper/85 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.24em] text-ink-soft shadow-[2px_2px_0_var(--color-edge)] lg:flex">
            <span className="h-1.5 w-1.5 rounded-[1px] bg-gold" />
            <span>
              {handsVisible} {handsVisible === 1 ? "hand" : "hands"}
            </span>
            <span className="text-ink-faint/60">·</span>
            <span>{tracking.stats.fps} fps</span>
            <span className="text-ink-faint/60">·</span>
            <span>{audio.instrument}</span>
          </div>

          {started && tracking.status === "loading" && (
            <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-[3px] border-2 border-edge bg-paper/90 px-3 py-1 text-[9px] uppercase tracking-[0.24em] text-ink-soft shadow-[2px_2px_0_var(--color-edge)] lg:top-3">
              initialising hand tracking…
            </div>
          )}

          {/* {snapshotConsent && (
            <div
              role="status"
              className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-[4px] border-2 border-edge bg-paper/95 px-3 py-2 font-mono text-[9px] shadow-[2px_2px_0_var(--color-edge)]"
              aria-live="polite"
            >
              <span>
                Discord ·{" "}
                {snapshot.status === "failed" ? "upload failed" : snapshotLabel}{" "}
                · max 12/day
              </span>
              <button
                type="button"
                onClick={() => changeSnapshotConsent(false)}
                className="uppercase tracking-[0.16em] text-magenta underline decoration-dotted underline-offset-2"
              >
                stop
              </button>
            </div>
          )} */}

          {tracking.status === "error" && (
            <div className="absolute left-1/2 top-20 z-30 w-[min(86%,22rem)] -translate-x-1/2 rounded-[6px] border-2 border-edge bg-surface px-4 py-3 text-center shadow-[3px_3px_0_var(--color-edge)] lg:top-12">
              <p className="text-[9px] font-semibold uppercase tracking-[0.26em] text-ember">
                tracking stopped
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
                {tracking.error}
              </p>
            </div>
          )}

          {cameraFaulted && (
            <div className="absolute inset-0 z-40 grid place-items-center bg-paper/88 p-6">
              <div className="panel max-w-sm px-5 py-5 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-magenta">
                  camera disconnected
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
                  {camera.error}
                </p>
                <Button
                  variant="gold"
                  size="sm"
                  block
                  className="mt-4"
                  onClick={() => {
                    void handleStart();
                  }}
                >
                  {starting ? "reconnecting…" : "reconnect camera"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="hidden lg:block">{hud}</div>
      </section>

      {/* Desktop right rail */}
      <aside className="scroll-thin hidden w-[256px] shrink-0 flex-col gap-2 lg:order-3 lg:flex lg:overflow-y-auto">
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

        <TipsPanel
          handsVisible={handsVisible}
          chordActive={chordActive}
          audioReady={audio.status === "ready"}
        />

        <div className="panel tone-lilac flex flex-col gap-1 px-3 py-2">
          <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-gold">
            {chordMode ? "Right hand" : "Pitch"}
          </span>
          <p className="text-[11px] leading-relaxed text-ink-soft">
            {chordMode
              ? "Raise it to open the tone and add volume. One to four fingers choose root, 1st inversion, 7th or dominant 7th; the thumb shifts an octave."
              : "Hold an extended fingertip and slide it: up bends the pitch higher, down bends it lower, and holding still keeps it steady. Every finger keeps its own voice."}
          </p>
        </div>
      </aside>

      {/* Mobile chrome */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-2.5 lg:hidden">
        <div className="rounded-[5px] border-2 border-edge bg-paper/90 px-2.5 py-1.5 shadow-[3px_3px_0_var(--color-edge)] backdrop-blur">
          <p className="font-display text-[12px] font-bold uppercase leading-none tracking-[-0.01em] text-ink">
            Sing Tone
          </p>
          <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.18em] text-ink-faint">
            {handsVisible}h · {tracking.stats.fps}fps · {audio.instrument}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {modeButtons}
          <Button
            size="sm"
            variant="outline"
            onClick={openGuide}
            aria-label="Open guide"
          >
            ?
          </Button>
        </div>
      </div>

      <SettingsSheet
        title="Settings"
        subtitle={`${pianoRange.label} range · ${chordMode ? "chords" : "pitch"} mode`}
      >
        {hud}
        <InstrumentSelector
          instrument={audio.instrument}
          onSelect={audio.selectInstrument}
        />
        {chordMode && <KeySelector keyId={keyId} onChange={changeKey} />}
        <PianoRangeSelector range={pianoRange} onChange={changeRange} />
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
        <CameraSelector
          devices={camera.devices}
          deviceId={camera.deviceId}
          onSelect={(deviceId) => {
            if (deviceId) void camera.selectDevice(deviceId);
          }}
        />
        {sessionPanel}
        <TipsPanel
          handsVisible={handsVisible}
          chordActive={chordActive}
          audioReady={audio.status === "ready"}
        />
        <Button variant="solid" block onClick={openGuide}>
          Open guide
        </Button>
      </SettingsSheet>

      <GuidePanel
        open={guideOpen}
        onClose={closeGuide}
        settings={settings}
        onChange={updateSettings}
        rangeLowMidi={rangeLowMidi}
        rangeHighMidi={rangeHighMidi}
        audioReady={audio.status === "ready"}
        audioError={audio.error}
        onEnableAudio={() => {
          void audio.start();
        }}
        trackingError={tracking.error}
      />

      {showInitialization && (
        <InitializationScreen
          stage={initStage}
          error={initError}
          onRetry={retryInitialization}
        />
      )}

      {import.meta.env.DEV && <FingerDebugOverlay />}

      {!started && (
        <StartGate
          starting={starting}
          error={camera.error}
          onStart={() => {
            // Camera frames stay in the tab: the consent UI is not part of this
            // screen, so nothing is uploaded by default.
            void handleStart(false);
          }}
        />
      )}
    </main>
  );
}
