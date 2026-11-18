import * as Tone from "tone";
import type { InstrumentId } from "../types/audio";
import type { PianoNote } from "../types/piano";
import {
  INSTRUMENT_VOLUME_DB,
  isAnalogSynthId,
  SYNTH_PATCHES,
  type AnalogSynthId,
} from "./instruments";

const SALAMANDER_BASE = "https://tonejs.github.io/audio/salamander/";
const CASIO_BASE = "https://tonejs.github.io/audio/casio/";

/** Sparse sample set used by Tone.js; the sampler pitch-shifts in between. */
const SAMPLER_URLS: Record<string, string> = {
  A1: "A1.mp3",
  C2: "C2.mp3",
  "D#2": "Ds2.mp3",
  "F#2": "Fs2.mp3",
  A2: "A2.mp3",
  C3: "C3.mp3",
  "D#3": "Ds3.mp3",
  "F#3": "Fs3.mp3",
  A3: "A3.mp3",
  C4: "C4.mp3",
  "D#4": "Ds4.mp3",
  "F#4": "Fs4.mp3",
  A4: "A4.mp3",
  C5: "C5.mp3",
  "D#5": "Ds5.mp3",
  "F#5": "Fs5.mp3",
  A5: "A5.mp3",
  C6: "C6.mp3",
  "D#6": "Ds6.mp3",
  "F#6": "Fs6.mp3",
  A6: "A6.mp3",
  C7: "C7.mp3",
  "D#7": "Ds7.mp3",
  "F#7": "Fs7.mp3",
  A7: "A7.mp3",
  C8: "C8.mp3",
};


interface Voice {
  readonly kind: "sampler" | "synth";
  attack(note: PianoNote, velocity: number, when: number): void;
  release(note: PianoNote, when: number): void;
  releaseAll(): void;
  dispose(): void;
}

class SamplerVoice implements Voice {
  readonly kind = "sampler" as const;
  private readonly sampler: Tone.Sampler;
  private readonly sounding = new Set<string>();

  constructor(sampler: Tone.Sampler) {
    this.sampler = sampler;
  }

  attack(note: PianoNote, velocity: number, when: number): void {
    this.sampler.triggerAttack(note, when, velocity);
    this.sounding.add(note);
  }

  release(note: PianoNote, when: number): void {
    if (!this.sounding.delete(note)) return;
    this.sampler.triggerRelease(note, when);
  }

  releaseAll(): void {
    for (const note of this.sounding) {
      this.sampler.triggerRelease(note);
    }
    this.sounding.clear();
  }

  dispose(): void {
    this.sounding.clear();
    this.sampler.dispose();
  }
}

class SynthVoice implements Voice {
  readonly kind = "synth" as const;
  private readonly synth: Tone.PolySynth;
  private readonly extras: readonly Tone.ToneAudioNode[];
  private readonly sounding = new Set<string>();

  constructor(synth: Tone.PolySynth, extras: readonly Tone.ToneAudioNode[] = []) {
    this.synth = synth;
    this.extras = extras;
  }

  attack(note: PianoNote, velocity: number, when: number): void {
    this.synth.triggerAttack(note, when, velocity);
    this.sounding.add(note);
  }

  release(note: PianoNote, when: number): void {
    if (!this.sounding.delete(note)) return;
    this.synth.triggerRelease(note, when);
  }

  releaseAll(): void {
    this.synth.releaseAll();
    this.sounding.clear();
  }

  dispose(): void {
    this.sounding.clear();
    this.synth.dispose();
    for (const node of this.extras) node.dispose();
  }
}

function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Sample load timed out")), ms);
    promise.then(
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Polyphonic instrument engine. Prefers sampled instruments (Tone.Sampler) and
 * transparently falls back to a synthesized voice if the soundfont cannot load.
 */
export class AudioEngine {
  private readonly limiter: Tone.Limiter;
  private readonly output: Tone.Volume;
  private readonly meter: Tone.Meter;
  private readonly analyser: Tone.Waveform;

  private voice: Voice | null = null;
  private instrument: InstrumentId = "grand";
  private held = new Map<PianoNote, number>();
  private loadToken = 0;
  private started = false;
  private disposed = false;
  private fallback = false;
  private level = 0;
  private waveform: Float32Array = new Float32Array(0);

  constructor() {
    this.limiter = new Tone.Limiter(-1.5);
    this.output = new Tone.Volume(0);
    this.meter = new Tone.Meter({ smoothing: 0.72, normalRange: true });
    this.analyser = new Tone.Waveform();

    this.limiter.connect(this.output);
    this.output.connect(this.meter);
    this.output.connect(this.analyser);
    this.output.toDestination();
  }

  get isStarted(): boolean {
    return this.started;
  }

  get usingFallback(): boolean {
    return this.fallback;
  }

  get currentInstrument(): InstrumentId {
    return this.instrument;
  }

  async init(instrument: InstrumentId): Promise<void> {
    await Tone.start();
    // Tighter scheduling window keeps fingertip-to-sound latency low.
    Tone.getContext().lookAhead = 0.03;
    this.started = true;
    if (!this.voice) await this.setInstrument(instrument);
  }

  async setInstrument(instrument: InstrumentId): Promise<void> {
    this.instrument = instrument;
    const token = ++this.loadToken;
    const previous = this.voice;
    previous?.releaseAll();

    let next: Voice;
    try {
      next = await this.createVoice(instrument, token);
    } catch {
      next = this.createSynthVoice(instrument);
    }

    if (this.disposed || token !== this.loadToken) {
      next.dispose();
      return;
    }

    this.voice = next;
    this.fallback = next.kind === "synth" && (instrument === "grand" || instrument === "electric");

    // Keep any notes that are still being held by the performer sounding.
    const when = Tone.now();
    for (const note of this.held.keys()) next.attack(note, 0.8, when);

    if (previous) {
      window.setTimeout(() => previous.dispose(), 1200);
    }
  }

  noteOn(note: PianoNote, velocity = 0.85): void {
    const count = this.held.get(note) ?? 0;
    this.held.set(note, count + 1);
    if (count > 0) return;
    this.voice?.attack(note, velocity, Tone.now());
  }

  noteOff(note: PianoNote): void {
    const count = this.held.get(note) ?? 0;
    if (count === 0) return;
    if (count > 1) {
      this.held.set(note, count - 1);
      return;
    }
    this.held.delete(note);
    this.voice?.release(note, Tone.now());
  }

  releaseAll(): void {
    this.held.clear();
    this.voice?.releaseAll();
  }

  setVolume(value: number): void {
    const clamped = Math.min(1, Math.max(0, value));
    const db = clamped <= 0.001 ? -60 : Tone.gainToDb(clamped);
    this.output.volume.rampTo(db, 0.06);
  }

  setMuted(muted: boolean): void {
    this.output.mute = muted;
  }

  /** Smoothed 0..1 output level for the meters. */
  getLevel(): number {
    const raw = this.meter.getValue();
    const value = typeof raw === "number" ? raw : (raw[0] ?? 0);
    const linear = value < -0.002 ? Math.pow(10, value / 20) : value;
    const scaled = Math.min(1, Math.max(0, Math.pow(linear, 0.6)));
    this.level += (scaled - this.level) * (scaled > this.level ? 0.5 : 0.1);
    return this.level;
  }

  /** Latest time-domain snapshot of the master output, or null before audio starts. */
  getWaveform(): Float32Array | null {
    if (!this.started) return null;
    const data = this.analyser.getValue();
    this.waveform = data;
    return this.waveform;
  }

  private async createVoice(instrument: InstrumentId, token: number): Promise<Voice> {
    if (instrument !== "grand" && instrument !== "electric") {
      return this.createSynthVoice(instrument);
    }

    const baseUrl = instrument === "grand" ? SALAMANDER_BASE : CASIO_BASE;
    const sampler = new Tone.Sampler({
      urls: SAMPLER_URLS,
      baseUrl,
      attack: 0.001,
      release: instrument === "grand" ? 1.4 : 0.9,
      volume: INSTRUMENT_VOLUME_DB[instrument],
    }).connect(this.limiter);

    if (this.disposed || token !== this.loadToken) {
      sampler.dispose();
      throw new Error("Superseded");
    }

    try {
      await withTimeout(Tone.loaded(), 12000);
    } catch (error) {
      sampler.dispose();
      throw error instanceof Error ? error : new Error("Sample load failed");
    }

    if (this.disposed || token !== this.loadToken) {
      sampler.dispose();
      throw new Error("Superseded");
    }

    return new SamplerVoice(sampler);
  }

  private createSynthVoice(instrument: InstrumentId): Voice {
    if (isAnalogSynthId(instrument)) return this.createAnalogVoice(instrument);

    let synth: Tone.PolySynth;

    switch (instrument) {
      case "electric":
        synth = new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 2.5,
          modulationIndex: 9,
          oscillator: { type: "sine" },
          envelope: { attack: 0.004, decay: 0.9, sustain: 0.18, release: 0.9 },
          modulation: { type: "sine" },
          modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0.05, release: 0.4 },
          volume: INSTRUMENT_VOLUME_DB.electric,
        });
        break;
      case "synth":
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "fatsawtooth", count: 3, spread: 26 },
          envelope: { attack: 0.09, decay: 0.5, sustain: 0.55, release: 1.5 },
          volume: INSTRUMENT_VOLUME_DB.synth,
        });
        break;
      case "marimba":
        synth = new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 3.01,
          modulationIndex: 6,
          oscillator: { type: "sine" },
          envelope: { attack: 0.001, decay: 0.5, sustain: 0.001, release: 0.7 },
          modulation: { type: "sine" },
          modulationEnvelope: { attack: 0.001, decay: 0.11, sustain: 0, release: 0.2 },
          volume: INSTRUMENT_VOLUME_DB.marimba,
        });
        break;
      case "grand":
      default:
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "triangle" },
          envelope: { attack: 0.003, decay: 1.2, sustain: 0.04, release: 1.2 },
          volume: INSTRUMENT_VOLUME_DB.grand,
        });
        break;
    }

    synth.connect(this.limiter);
    // Ten fingers plus release tails can exceed a small voice pool quickly.
    synth.maxPolyphony = 48;
    return new SynthVoice(synth);
  }

  /**
   * Warm, Bright and Retro share this builder. Each patch supplies its own
   * oscillator, filter and envelope, so the character stays distinct while the
   * routing and polyphony logic exist once.
   */
  private createAnalogVoice(instrument: AnalogSynthId): Voice {
    const patch = SYNTH_PATCHES[instrument];
    const envelope = { ...patch.envelope };
    const volume = INSTRUMENT_VOLUME_DB[instrument];

    let synth: Tone.PolySynth;
    if (patch.waveform === "fatsawtooth" || patch.waveform === "fattriangle") {
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: {
          type: patch.waveform,
          count: patch.count ?? 3,
          spread: patch.spread ?? 16,
        },
        envelope,
        volume,
      });
    } else {
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: patch.waveform },
        envelope,
        volume,
      });
    }

    const filter = new Tone.Filter({
      type: patch.filter.type,
      frequency: patch.filter.frequency,
      Q: patch.filter.q,
      rolloff: -12,
    });

    synth.connect(filter);
    filter.connect(this.limiter);
    synth.maxPolyphony = 48;

    return new SynthVoice(synth, [filter]);
  }

  dispose(): void {
    this.disposed = true;
    this.loadToken += 1;
    this.held.clear();
    this.voice?.dispose();
    this.voice = null;
    this.meter.dispose();
    this.analyser.dispose();
    this.limiter.dispose();
    this.output.dispose();
  }
}
