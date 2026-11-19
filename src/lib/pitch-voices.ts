import * as Tone from "tone";
import type { InstrumentId } from "../types/audio";
import { INSTRUMENT_VOLUME_DB, SYNTH_PATCHES, isAnalogSynthId } from "./instruments";
import { clamp01 } from "./hand-geometry";
import { frequencyFor } from "./pitch-mapping";

interface LiveVoice {
  node: Tone.Synth | Tone.FMSynth;
  filter: Tone.Filter | null;
  timer: number | null;
}

/** Ten fingers is the physical maximum; anything more is a leaked voice. */
const MAX_VOICES = 10;

/**
 * Continuous voices, one per fingertip. Unlike the chord engine these never
 * retrigger: a voice is attacked once, then its frequency is ramped, which is
 * what makes a finger slide sound like a bend instead of a series of notes.
 *
 * Timbre follows the selected instrument. The sampled pianos have no
 * continuously bendable pitch, so they use the synthesised fallback patches
 * the engine already ships for them.
 */
export class PitchVoicePool {
  private readonly instrument: InstrumentId;
  private readonly destination: Tone.ToneAudioNode;
  private readonly voices = new Map<string, LiveVoice>();

  constructor(instrument: InstrumentId, destination: Tone.ToneAudioNode) {
    this.instrument = instrument;
    this.destination = destination;
  }

  get size(): number {
    return this.voices.size;
  }

  noteOn(key: string, midi: number, velocity: number): void {
    const existing = this.voices.get(key);
    if (existing) {
      this.setMidi(key, midi, 0.02);
      return;
    }
    if (this.voices.size >= MAX_VOICES) return;
    const voice = this.createVoice();
    this.voices.set(key, voice);
    voice.node.triggerAttack(frequencyFor(midi), Tone.now(), clamp01(velocity));
  }

  setMidi(key: string, midi: number, glide: number): void {
    const voice = this.voices.get(key);
    if (!voice) return;
    // A short ramp on the frequency signal glides without zipper noise.
    voice.node.frequency.rampTo(frequencyFor(midi), Math.max(0.012, glide));
  }

  noteOff(key: string): void {
    const voice = this.voices.get(key);
    if (!voice) return;
    this.voices.delete(key);
    try {
      voice.node.triggerRelease();
    } catch {
      // Releasing an already-released voice is harmless.
    }
    voice.timer = window.setTimeout(() => {
      voice.node.dispose();
      voice.filter?.dispose();
    }, 1400);
  }

  releaseAll(): void {
    for (const key of [...this.voices.keys()]) this.noteOff(key);
  }

  dispose(): void {
    for (const [key, voice] of [...this.voices]) {
      this.voices.delete(key);
      if (voice.timer !== null) window.clearTimeout(voice.timer);
      voice.node.dispose();
      voice.filter?.dispose();
    }
  }

  private createVoice(): LiveVoice {
    const volume = INSTRUMENT_VOLUME_DB[this.instrument] - 7;
    // Held fingers need sustain; the character comes from oscillator, filter
    // and attack, not from a dying envelope.
    const sustain = { attack: 0.012, decay: 0.32, sustain: 0.62, release: 0.42 };

    if (isAnalogSynthId(this.instrument)) {
      const patch = SYNTH_PATCHES[this.instrument];
      const fat = patch.waveform === "fatsawtooth" || patch.waveform === "fattriangle";
      const synth = new Tone.Synth({
        oscillator: fat
          ? { type: patch.waveform, count: patch.count ?? 3, spread: patch.spread ?? 16 }
          : { type: patch.waveform },
        envelope: { ...sustain, attack: Math.min(0.02, patch.envelope.attack) },
        volume,
      });
      const filter = new Tone.Filter({
        type: patch.filter.type,
        frequency: patch.filter.frequency,
        Q: patch.filter.q,
        rolloff: -12,
      });
      synth.connect(filter);
      filter.connect(this.destination);
      return { node: synth, filter, timer: null };
    }

    if (this.instrument === "electric" || this.instrument === "marimba") {
      const synth = new Tone.FMSynth({
        harmonicity: this.instrument === "electric" ? 2.5 : 3.01,
        modulationIndex: this.instrument === "electric" ? 9 : 6,
        oscillator: { type: "sine" },
        envelope: sustain,
        modulation: { type: "sine" },
        modulationEnvelope:
          this.instrument === "electric"
            ? { attack: 0.005, decay: 0.4, sustain: 0.2, release: 0.35 }
            : { attack: 0.003, decay: 0.2, sustain: 0.12, release: 0.3 },
        volume,
      }).connect(this.destination);
      return { node: synth, filter: null, timer: null };
    }

    // Grand piano fallback and the wide "Synth": soft triangle / detuned saws.
    const synth =
      this.instrument === "synth"
        ? new Tone.Synth({
            oscillator: { type: "fatsawtooth", count: 3, spread: 26 },
            envelope: sustain,
            volume,
          }).connect(this.destination)
        : new Tone.Synth({
            oscillator: { type: "triangle" },
            envelope: { ...sustain, attack: 0.006, release: 0.5 },
            volume,
          }).connect(this.destination);

    return { node: synth, filter: null, timer: null };
  }
}
