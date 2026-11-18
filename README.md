# sing-tone

An invisible chord instrument in the browser. Your webcam feeds a local MediaPipe hand-landmark
model, and hand signs become chords — no keys, no mouse, no controller.

- **Left hand** — 1–5 fingers for degrees I–V, index + pinky for VI, add the thumb for VII.
  Roll the hand for major/minor; a fist mutes the chord.
- **Right hand** — 1–4 fingers for root position, 1st inversion, 7th or dominant 7th.
  Thumb out/in shifts the octave, hand height sets volume.
- **Key**, **note range** (chord register) and **instrument** are chosen in the top bar.

Video never leaves the device: tracking runs in this browser tab, and audio is generated with
Tone.js.

## Run

```bash
npm install
npm run setup:assets   # downloads the MediaPipe wasm runtime + hand model (once)
npm run dev
```

`npm run build` type-checks and builds the static site into `dist/`.
