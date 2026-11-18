import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine } from "../lib/audio-engine";
import { readStoredInstrument, storeInstrument } from "../lib/instruments";
import type { AudioStatus, InstrumentId } from "../types/audio";
import type { RefObject } from "react";

export interface UseAudioEngineResult {
  status: AudioStatus;
  error: string | null;
  instrument: InstrumentId;
  volume: number;
  muted: boolean;
  usingFallback: boolean;
  engineRef: RefObject<AudioEngine | null>;
  start: () => Promise<boolean>;
  selectInstrument: (instrument: InstrumentId) => void;
  changeVolume: (value: number) => void;
  toggleMute: () => void;
}

export function useAudioEngine(): UseAudioEngineResult {
  const engineRef = useRef<AudioEngine | null>(null);
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [instrument, setInstrument] = useState<InstrumentId>(readStoredInstrument);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);

  const instrumentRef = useRef(instrument);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  instrumentRef.current = instrument;
  volumeRef.current = volume;
  mutedRef.current = muted;

  const getEngine = useCallback((): AudioEngine => {
    let engine = engineRef.current;
    if (!engine) {
      engine = new AudioEngine();
      engine.setVolume(volumeRef.current);
      engine.setMuted(mutedRef.current);
      engineRef.current = engine;
    }
    return engine;
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    const engine = getEngine();
    setStatus("loading");
    try {
      await engine.init(instrumentRef.current);
      engine.setVolume(volumeRef.current);
      engine.setMuted(mutedRef.current);
      setUsingFallback(engine.usingFallback);
      setStatus("ready");
      setError(null);
      return true;
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error
          ? `Audio could not start: ${err.message}`
          : "Audio could not start in this browser.",
      );
      return false;
    }
  }, [getEngine]);

  const selectInstrument = useCallback((next: InstrumentId) => {
    setInstrument(next);
    // Instrument choice persists independently of the note range.
    storeInstrument(next);
    const engine = engineRef.current;
    if (!engine || !engine.isStarted) return;
    void engine
      .setInstrument(next)
      .then(() => {
        if (engineRef.current === engine) setUsingFallback(engine.usingFallback);
      })
      .catch(() => {
        // The engine falls back to synthesis internally; nothing to surface here.
      });
  }, []);

  const changeVolume = useCallback((value: number) => {
    setVolume(value);
    engineRef.current?.setVolume(value);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    },
    [],
  );

  return {
    status,
    error,
    instrument,
    volume,
    muted,
    usingFallback,
    engineRef,
    start,
    selectInstrument,
    changeVolume,
    toggleMute,
  };
}
