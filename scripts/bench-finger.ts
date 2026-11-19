/**
 * Micro-benchmark for the recognition pipeline.
 *
 * Builds a synthetic two-hand landmark set and measures how long one
 * `FingerClassifier.update()` costs per hand, plus the throughput of the
 * geometry stage on its own. Numbers are CPU-only, so they compare code
 * versions on the same machine rather than predicting device FPS.
 *
 *   node_modules/.bin/esbuild scripts/bench-finger.ts --bundle --format=esm \
 *     --platform=node --outfile=/tmp/bench-finger.mjs && node /tmp/bench-finger.mjs
 */
import { FingerClassifier } from "../src/lib/finger-classifier";
import { analyzeHand } from "../src/lib/finger-extension";
import type { HandSample, Landmark } from "../src/types/hand";

const ITERATIONS = 20_000;

/** One plausible open right hand in normalized video coordinates. */
function makeHand(phase: number): HandSample {
  const drift = Math.sin(phase) * 0.004;
  const point = (x: number, y: number, z = 0): Landmark => ({
    x: x + drift,
    y: y + drift * 0.5,
    z,
  });
  const landmarks: Landmark[] = [
    point(0.5, 0.78, 0), // wrist
    point(0.44, 0.71, -0.01),
    point(0.41, 0.66, -0.02),
    point(0.395, 0.62, -0.03),
    point(0.385, 0.58, -0.04), // thumb tip
    point(0.475, 0.6, 0), // index mcp
    point(0.472, 0.52, -0.01),
    point(0.47, 0.47, -0.02),
    point(0.469, 0.435, -0.03), // index tip
    point(0.505, 0.595, 0),
    point(0.505, 0.5, -0.01),
    point(0.505, 0.44, -0.02),
    point(0.505, 0.4, -0.03), // middle tip
    point(0.535, 0.6, 0),
    point(0.538, 0.515, -0.01),
    point(0.54, 0.465, -0.02),
    point(0.541, 0.43, -0.03), // ring tip
    point(0.563, 0.615, 0),
    point(0.567, 0.545, -0.01),
    point(0.569, 0.5, -0.02),
    point(0.57, 0.47, -0.03), // pinky tip
  ];
  return { handedness: "right", score: 0.97, landmarks };
}

function batch(label: string, runs: number, fn: (index: number) => void): number {
  for (let i = 0; i < 2_000; i += 1) fn(i); // warm up the JIT
  const started = performance.now();
  for (let i = 0; i < runs; i += 1) fn(i);
  const elapsed = performance.now() - started;
  const perOp = elapsed / runs;
  console.log(
    `${label.padEnd(28)} ${elapsed.toFixed(1).padStart(8)} ms total  ` +
      `${perOp.toFixed(4).padStart(8)} ms/op  ${Math.round(1000 / perOp).toString().padStart(6)} ops/s`,
  );
  return perOp;
}

const hand = makeHand(0);
const classifier = new FingerClassifier("right");
classifier.configure(0.62, 0.42);
let clock = 0;

const geometry = batch("analyzeHand (geometry)", ITERATIONS, () => {
  analyzeHand(hand, 16 / 9);
});

const classify = batch("FingerClassifier.update", ITERATIONS, (i) => {
  clock += 33;
  classifier.update(makeHand(i * 0.001), 16 / 9, clock);
});

console.log(`\ngeometry share of classify: ${((geometry / classify) * 100).toFixed(1)}%`);
console.log(`two hands per inference: ${(classify * 2).toFixed(4)} ms`);
console.log(`share of a 33 ms (30 fps) inference budget: ${(((classify * 2) / 33) * 100).toFixed(1)}%`);
