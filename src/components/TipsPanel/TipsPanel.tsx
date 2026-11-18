import { useEffect, useState } from "react";

interface TipsPanelProps {
  handsVisible: number;
  chordActive: boolean;
  audioReady: boolean;
}

const AUDIO_TIPS = [
  "Sound needs one tap: use the speaker control or the enable-sound chip up top.",
  "Browsers suspend audio until you interact with the page — one click is all it takes.",
];

const POSITION_TIPS = [
  "Raise both hands into frame, palms toward the camera, fingers spread.",
  "Keep your hands an arm's length away so the tracker can see all 21 points.",
  "Even, front-on light helps. Avoid a bright window behind you.",
];

const DEGREE_TIPS = [
  "Left hand: one to four fingers pick I–IV, all five picks V.",
  "Index + pinky is VI, index + pinky + thumb is VII.",
  "Roll the left hand: index side down is major, index side up is minor.",
];

const VOICING_TIPS = [
  "Right hand: 1 finger root position, 2 first inversion, 3 seventh, 4 dominant seventh.",
  "Thumb out lowers an octave; thumb tucked in raises it.",
  "Raise the right hand for more volume, lower it for a softer chord.",
];

const PLAY_TIPS = [
  "Change one hand at a time — the chord settles in about a tenth of a second.",
  "A fist on the left hand mutes the chord instantly.",
  "Switch instruments or keys mid-performance — tracking keeps running.",
  "The key sets the roots; the note range sets the octave the chords start in.",
];

export function TipsPanel({ handsVisible, chordActive, audioReady }: TipsPanelProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setIndex((current) => current + 1), 8500);
    return () => window.clearInterval(timer);
  }, []);

  const pool = !audioReady
    ? AUDIO_TIPS
    : handsVisible === 0
      ? POSITION_TIPS
      : !chordActive
        ? DEGREE_TIPS
        : [...VOICING_TIPS, ...PLAY_TIPS];
  const tip = pool[index % pool.length] ?? pool[0];

  return (
    <div className="panel-quiet w-[248px] px-3.5 py-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="breathe h-1 w-1 rounded-full bg-gold" />
        <span className="text-[9px] uppercase tracking-[0.26em] text-ink-faint">Tip</span>
      </div>
      <p key={tip} className="animate-fade-in text-[11px] leading-relaxed text-ink-soft">
        {tip}
      </p>
    </div>
  );
}
