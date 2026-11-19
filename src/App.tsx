import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { readStoredKey, storeKey } from "./lib/gesture-chords";
import type { KeyId } from "./lib/gesture-chords";
import type { LandmarkerOptions } from "./lib/mediapipe";
import { getPianoRange, readStoredPianoRange, storePianoRange } from "./lib/piano-ranges";
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [settings, setSettings] = useState<PerformanceSettings>(INITIAL_SETTINGS);
  const [rangeId, setRangeId] = useState<PianoRangeId>(readStoredPianoRange);
  const [keyId, setKeyId] = useState<KeyId>(readStoredKey);
  const [mode, setMode] = useState<PlayMode>(readStoredMode);

  const pianoRange = useMemo(() => getPianoRange(rangeId), [rangeId]);
  const rangeLowMidi = useMemo(() => noteToMidi(pianoRange.lowest), [pianoRange]);
  const rangeHighMidi = useMemo(() => noteToMidi(pianoRange.highest), [pianoRange]);

  const pitchWindow = useMemo(
    () =>
      clampWindow(
        settings.pitchLowMidi,
        settings.pitchHighMidi,
        rangeLowMidi,
        rangeHighMidi,
      ),
    [settings.pitchLowMidi, settings.pitchHighMidi, rangeLowMidi, rangeHighMidi],
  );

  // The selected note range owns the pitch boundaries.
  useEffect(() => {
    setSettings((previous) => {
      const next = windowForBendRange(rangeLowMidi, rangeHighMidi, previous.pitchBendRange);
      if (previous.pitchLowMidi === next.low && previous.pitchHighMidi === next.high) {
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
      minHandPresenceConfidence: Math.max(0.3, settings.detectionConfidence - 0.1),
      minTrackingConfidence: Math.max(0.3, settings.detectionConfidence - 0.1),
    }),
    [settings.detectionConfidence],
  );

  const tracking = useHandTracking(videoRef, trackingEnabled, landmarkerOptions);
  const trackingLive = trackingEnabled && tracking.status === "ready";
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

  const updateSettings = useCallback(
    (patch: Partial<PerformanceSettings>) => {
      setSettings((previous) => {
        const merged = { ...previous, ...patch };
        if (patch.pitchBendRange !== undefined) {
          const next = windowForBendRange(rangeLowMidi, rangeHighMidi, merged.pitchBendRange);
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

  const cameraFaulted =
    started && camera.status !== "ready" && camera.status !== "requesting";
  const chordActive = chordMode && gesture.snapshot.chordName !== null;
  const handsVisible = Math.max(gesture.handsVisible, pitch.snapshot.handsVisible);
  const voiceCount = pitch.snapshot.voices.length;

  return (
    <main className="relative flex h-dvh w-full flex-col gap-2.5 overflow-y-auto bg-paper p-2.5 text-ink select-none lg:flex-row lg:gap-3 lg:overflow-hidden lg:p-3">
      {/* Left rail — setup */}
      <aside className="scroll-thin order-3 flex w-full shrink-0 flex-col gap-2.5 lg:order-1 lg:w-[254px] lg:overflow-y-auto">
        <div className="flex items-start justify-between gap-2 px-1 pb-0.5">
          <div>
            <p className="font-display text-[16px] leading-none tracking-[0.26em] text-ink">
              SING&nbsp;TONE
            </p>
            <p className="mt-1.5 text-[8px] uppercase tracking-[0.3em] text-ink-faint">
              gesture chord synth
            </p>
          </div>
          <Button
            size="sm"
            variant="quiet"
            onClick={openGuide}
            className="!border-line !bg-transparent !text-ink-soft hover:!text-ink"
          >
            Guide
          </Button>
        </div>

        <div className="panel flex flex-col gap-2 px-3 py-2.5">
          <span className="text-[9px] uppercase tracking-[0.24em] text-ink-faint">Mode</span>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              block
              variant={chordMode ? "solid" : "outline"}
              aria-pressed={chordMode}
              onClick={() => changeMode("chords")}
            >
              Chords
            </Button>
            <Button
              size="sm"
              block
              variant={chordMode ? "outline" : "solid"}
              aria-pressed={!chordMode}
              onClick={() => changeMode("pitch")}
            >
              Pitch
            </Button>
          </div>
          <span className="text-[10px] leading-snug text-ink-faint">
            {chordMode
              ? "Left hand picks the degree, right hand the voicing."
              : "Each fingertip bends its own continuous pitch."}
          </span>
        </div>

        <InstrumentSelector instrument={audio.instrument} onSelect={audio.selectInstrument} />
        {chordMode ? (
          <>
            <KeySelector keyId={keyId} onChange={changeKey} />
            <PianoRangeSelector range={pianoRange} onChange={changeRange} />
          </>
        ) : (
          <>
            <PianoRangeSelector range={pianoRange} onChange={changeRange} />
            <div className="panel flex flex-col gap-1 px-3.5 py-2.5">
              <span className="text-[9px] uppercase tracking-[0.24em] text-ink-faint">
                Pitch window
              </span>
              <span className="font-mono text-[11px] text-ink">
                {pitchWindow.low} → {pitchWindow.high} midi
              </span>
              <span className="text-[10px] leading-snug text-ink-faint">
                {rangeHighMidi - rangeLowMidi} semitones available in {pianoRange.label}
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

        <div className="panel flex flex-col gap-1.5 px-3.5 py-3">
          <span className="text-[9px] uppercase tracking-[0.24em] text-ink-faint">Session</span>
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
          <p className="mt-1 text-[9px] leading-snug text-ink-faint">
            Camera frames stay inside this tab.
          </p>
        </div>
      </aside>

      {/* Stage — camera in the middle */}
      <section className="relative order-1 flex min-h-[54dvh] min-w-0 flex-1 flex-col gap-2.5 lg:order-2 lg:min-h-0">
        <div className="relative flex-1 overflow-hidden rounded-[6px] border border-line bg-paper shadow-[0_18px_44px_-34px_rgba(0,0,0,0.9)]">
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

          <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-2 rounded-[2px] border border-line/80 bg-paper/80 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.24em] text-ink-soft backdrop-blur">
            <span className="h-1 w-1 rounded-[1px] bg-gold" />
            <span>
              {handsVisible} {handsVisible === 1 ? "hand" : "hands"}
            </span>
            <span className="text-ink-faint/60">·</span>
            <span>{tracking.stats.fps} fps</span>
            <span className="hidden text-ink-faint/60 sm:inline">·</span>
            <span className="hidden sm:inline">{audio.instrument}</span>
          </div>

          {started && tracking.status === "loading" && (
            <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-[2px] border border-line/80 bg-paper/80 px-3 py-1 text-[9px] uppercase tracking-[0.24em] text-ink-soft backdrop-blur">
              initialising hand tracking…
            </div>
          )}

          {tracking.status === "error" && (
            <div className="absolute left-1/2 top-12 z-30 w-[min(86%,22rem)] -translate-x-1/2 rounded-[5px] border border-line bg-surface/95 px-4 py-3 text-center backdrop-blur">
              <p className="text-[9px] uppercase tracking-[0.26em] text-ember">tracking stopped</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{tracking.error}</p>
            </div>
          )}

          {cameraFaulted && (
            <div className="absolute inset-0 z-40 grid place-items-center bg-paper/85 p-6 backdrop-blur-sm">
              <div className="panel max-w-sm px-5 py-5 text-center">
                <p className="text-[9px] uppercase tracking-[0.3em] text-magenta">
                  camera disconnected
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">{camera.error}</p>
                <Button variant="gold" size="sm" block className="mt-4" onClick={handleStart}>
                  {starting ? "reconnecting…" : "reconnect camera"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {chordMode ? (
          <GestureHud keyId={keyId} snapshot={gesture.snapshot} />
        ) : (
          <PitchMeter window={pitchWindow} snapshot={pitch.snapshot} />
        )}
      </section>

      {/* Right rail — sound and coaching */}
      <aside className="scroll-thin order-2 flex w-full shrink-0 flex-col gap-2.5 lg:order-3 lg:w-[288px] lg:overflow-y-auto">
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

        <div className="panel flex flex-col gap-1.5 px-3.5 py-3">
          <span className="text-[9px] uppercase tracking-[0.24em] text-ink-faint">
            {chordMode ? "Right hand" : "Pitch"}
          </span>
          <p className="text-[11px] leading-relaxed text-ink-soft">
            {chordMode
              ? "Raise it to open the tone and add volume. One to four fingers choose root, 1st inversion, 7th or dominant 7th; the thumb shifts an octave."
              : "Hold an extended fingertip and slide it: up bends the pitch higher, down bends it lower, and holding still keeps it steady. Every finger keeps its own voice."}
          </p>
        </div>
      </aside>

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

      {!started && <StartGate starting={starting} error={camera.error} onStart={handleStart} />}
    </main>
  );
}
