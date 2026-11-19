/**
 * Synthetic acceptance check for the finger recognizer.
 *
 * Builds anatomically plausible 21-landmark hands for each test configuration,
 * feeds them through the real FingerClassifier at 30 fps, and asserts that
 * only genuinely open fingers ever become active.
 *
 * Run with: npx esbuild scripts/finger-check.ts --bundle --format=esm
 *           --platform=node --outfile=/tmp/finger-check.mjs && node /tmp/finger-check.mjs
 */
import { FingerClassifier } from "../src/lib/finger-classifier";
import type { FingerReadings } from "../src/lib/finger-classifier";
import type { FingerName, HandSample, Landmark } from "../src/types/hand";

type Pose = "open" | "closed" | "partial";
type FingerPose = Record<FingerName, Pose>;

const FINGERS: readonly FingerName[] = ["thumb", "index", "middle", "ring", "pinky"];

const OPEN_SPREAD: Record<Exclude<FingerName, "thumb">, number> = {
  index: -0.16,
  middle: -0.02,
  ring: 0.1,
  pinky: 0.22,
};

const LENGTHS: Record<Exclude<FingerName, "thumb">, readonly [number, number, number]> = {
  index: [0.034, 0.022, 0.017],
  middle: [0.037, 0.025, 0.018],
  ring: [0.034, 0.023, 0.017],
  pinky: [0.027, 0.018, 0.014],
};

const CURLS: Record<Pose, readonly [number, number, number]> = {
  open: [0.02, 0.02, 0.02],
  // A visibly bent finger that is still short of extension, not a relaxed one.
  partial: [1.0, 0.95, 0.8],
  closed: [1.25, 1.15, 0.9],
};

const BASES: Record<Exclude<FingerName, "thumb">, [number, number]> = {
  index: [-0.035, -0.08],
  middle: [-0.001, -0.092],
  ring: [0.026, -0.086],
  pinky: [0.034, -0.074],
};

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function chain(
  base: Vec3,
  spread: number,
  lengths: readonly [number, number, number],
  curls: readonly [number, number, number],
): Vec3[] {
  const points: Vec3[] = [base];
  let angle = spread;
  let current = base;
  for (let i = 0; i < 3; i += 1) {
    angle += curls[i] ?? 0;
    const length = lengths[i] ?? 0;
    current = {
      x: current.x + Math.sin(angle) * length,
      y: current.y - Math.cos(angle) * length,
      z: current.z,
    };
    points.push(current);
  }
  return points;
}

function thumbChain(pose: Pose): Vec3[] {
  const curls: readonly [number, number, number] =
    pose === "open" ? [0.05, 0.05, 0.04] : pose === "partial" ? [0.7, 0.65, 0.6] : [0.95, 1.0, 0.9];
  return chain({ x: -0.028, y: -0.022, z: 0 }, -1.15, [0.03, 0.024, 0.02], curls);
}

function buildPose(pose: FingerPose): Vec3[] {
  const thumb = thumbChain(pose.thumb);
  const points: Vec3[] = [];
  points[0] = { x: 0, y: 0, z: 0 };
  // Thumb 1..4
  for (let i = 0; i < 4; i += 1) points[1 + i] = thumb[i] ?? { x: 0, y: 0, z: 0 };

  const order: Exclude<FingerName, "thumb">[] = ["index", "middle", "ring", "pinky"];
  order.forEach((finger, index) => {
    const [bx, by] = BASES[finger];
    const fingerPoints = chain(
      { x: bx, y: by, z: 0 },
      OPEN_SPREAD[finger],
      LENGTHS[finger],
      CURLS[pose[finger]],
    );
    const start = 5 + index * 4;
    for (let i = 0; i < 4; i += 1) points[start + i] = fingerPoints[i] ?? { x: 0, y: 0, z: 0 };
  });

  return points;
}

function rotate(point: Vec3, roll: number, tilt: number): Vec3 {
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
  const x = point.x * cosRoll - point.y * sinRoll;
  const y = point.x * sinRoll + point.y * cosRoll;
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  return { x, y: y * cosTilt, z: y * sinTilt };
}

interface HandOptions {
  roll?: number;
  tilt?: number;
  noise?: number;
  shiftX?: number;
  shiftY?: number;
  scale?: number;
}

const ASPECT = 16 / 9;

function makeHand(pose: FingerPose, frame: number, options: HandOptions = {}): HandSample {
  const {
    roll = 0,
    tilt = 0,
    noise = 0.0006,
    shiftX = 0,
    shiftY = 0,
    scale = 1,
  } = options;
  const points = buildPose(pose);
  const landmarks: Landmark[] = points.map((point, index) => {
    const rotated = rotate({ x: point.x * scale, y: point.y * scale, z: point.z * scale }, roll, tilt);
    const jitter = index === 0 ? 0 : noise;
    return {
      x: 0.5 + shifted(jitter, frame, index) + shiftX + rotated.x / ASPECT,
      y: 0.62 + shifted(jitter, frame, index + 31) + shiftY + rotated.y,
      z: rotated.z + shifted(jitter * 0.4, frame, index + 71),
    };
  });
  return { handedness: "right", score: 0.97, landmarks };
}

/** Deterministic pseudo-noise, stable but not perfectly repeating. */
function shifted(amplitude: number, frame: number, salt: number): number {
  if (amplitude === 0) return 0;
  const value = Math.sin(frame * 1.7 + salt * 2.3) * 0.6 + Math.sin(frame * 0.9 + salt * 5.1) * 0.4;
  return value * amplitude;
}

function runFrames(
  classifier: FingerClassifier,
  frames: Array<HandSample | null>,
  start = 1000,
): FingerReadings[] {
  const history: FingerReadings[] = [];
  let now = start;
  for (const hand of frames) {
    history.push(classifier.update(hand, ASPECT, now));
    now += 33;
  }
  return history;
}

function activeOf(readings: FingerReadings): Set<FingerName> {
  const active = new Set<FingerName>();
  for (const finger of FINGERS) {
    if (readings[finger].active) active.add(finger);
  }
  return active;
}

function statesOf(readings: FingerReadings): string {
  return FINGERS.map((finger) => `${finger}:${readings[finger].state}`).join(" ");
}

let failures = 0;
let checks = 0;

function expect(label: string, condition: boolean, detail: string): void {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`  FAIL ${label} — ${detail}`);
}

function steady(pose: FingerPose, count: number, options: HandOptions = {}): HandSample[] {
  return Array.from({ length: count }, (_, frame) => makeHand(pose, frame, options));
}

function expectActiveSet(
  label: string,
  pose: FingerPose,
  expected: readonly FingerName[],
  options: HandOptions = {},
): void {
  const classifier = new FingerClassifier("right");
  classifier.configure(0.62, 0.42);
  const history = runFrames(classifier, steady(pose, 26, options));
  const last = history[history.length - 1];
  if (!last) {
    expect(label, false, "no readings produced");
    return;
  }
  const active = activeOf(last);
  const expectedSet = new Set(expected);
  const same =
    active.size === expectedSet.size && [...expectedSet].every((finger) => active.has(finger));
  const scores = FINGERS.map(
    (finger) => `${finger}=${last[finger].extension.toFixed(2)}/${last[finger].confidence.toFixed(2)}`,
  ).join(" ");
  console.log(`   ${scores}`);
  expect(
    label,
    same,
    `expected [${[...expectedSet].join(",")}] got [${[...active].join(",")}] · ${statesOf(last)} · ${scores}`,
  );

  // Non-open fingers must never activate in *any* frame after warm-up.
  const forbidden = FINGERS.filter((finger) => !expectedSet.has(finger));
  for (let i = 10; i < history.length; i += 1) {
    const readings = history[i];
    if (!readings) continue;
    for (const finger of forbidden) {
      expect(
        `${label} / ${finger} never activates`,
        !readings[finger].active,
        `frame ${i} · ${statesOf(readings)}`,
      );
    }
  }
}

function allPose(pose: Pose): FingerPose {
  return { thumb: pose, index: pose, middle: pose, ring: pose, pinky: pose };
}

function mix(open: readonly FingerName[]): FingerPose {
  const pose = allPose("closed");
  for (const finger of open) pose[finger] = "open";
  return pose;
}

console.log("1. all five open");
expectActiveSet("all open", allPose("open"), ["thumb", "index", "middle", "ring", "pinky"]);

console.log("2. all five closed");
expectActiveSet("all closed", allPose("closed"), []);

console.log("3. only index open");
expectActiveSet("index only", mix(["index"]), ["index"]);

console.log("4. only middle open");
expectActiveSet("middle only", mix(["middle"]), ["middle"]);

console.log("5. index + middle open");
expectActiveSet("index + middle", mix(["index", "middle"]), ["index", "middle"]);

console.log("6. thumb open, fingers closed");
expectActiveSet("thumb only", mix(["thumb"]), ["thumb"]);

console.log("7. three open, two closed");
expectActiveSet("index/ring/pinky", mix(["index", "ring", "pinky"]), ["index", "ring", "pinky"]);

console.log("8. partially bent fingers");
expectActiveSet("partial", allPose("partial"), []);

console.log("9. overlapping fingers");
{
  const classifier = new FingerClassifier("right");
  classifier.configure(0.62, 0.42);
  const pose = mix(["index", "middle"]);
  const frames = steady(pose, 26).map((hand) => {
    const indexTip = hand.landmarks[8];
    const middleBase = hand.landmarks[9];
    if (indexTip && middleBase) {
      // Middle finger landmarks collapse onto the index fingertip: a classic
      // tracking overlap. Whatever the classifier does, the system must not
      // report both fingers active at the same screen position.
      hand.landmarks[10] = { ...indexTip };
      hand.landmarks[11] = { ...indexTip };
      hand.landmarks[12] = { ...indexTip };
    }
    return hand;
  });
  const history = runFrames(classifier, frames);
  const last = history[history.length - 1];
  const active = last ? activeOf(last) : new Set<FingerName>();
  expect("overlap: not both index+middle", !(active.has("index") && active.has("middle")), statesOf(last ?? history[0]!));
  expect("overlap: nothing else activates", [...active].every((f) => f === "index" || f === "middle"), statesOf(last ?? history[0]!));
}

console.log("10. rotated and tilted hand");
expectActiveSet("roll 45°, tilt 30°", allPose("open"), ["thumb", "index", "middle", "ring", "pinky"], {
  roll: Math.PI / 4,
  tilt: Math.PI / 6,
});
expectActiveSet("roll -35°, tilt -25°", allPose("open"), ["thumb", "index", "middle", "ring", "pinky"], {
  roll: -0.61,
  tilt: -0.44,
});

console.log("11. hand moving quickly");
{
  const classifier = new FingerClassifier("right");
  classifier.configure(0.62, 0.42);
  const pose = allPose("open");
  const frames = Array.from({ length: 30 }, (_, frame) =>
    makeHand(pose, frame, { shiftX: frame * 0.012, shiftY: frame * 0.006 }),
  );
  const history = runFrames(classifier, frames);
  const last = history[history.length - 1];
  const active = last ? activeOf(last) : new Set<FingerName>();
  expect("fast motion keeps all five open", active.size === 5, statesOf(last ?? history[0]!));
}

console.log("12. temporary landmark loss");
{
  const classifier = new FingerClassifier("right");
  classifier.configure(0.62, 0.42);
  const pose = allPose("open");
  const before = steady(pose, 20);
  const lost: Array<HandSample | null> = [null, null, null, null];
  const after = steady(pose, 20);
  const history = runFrames(classifier, [...before, ...lost, ...after]);
  const duringLoss = history[22];
  const afterLoss = history[history.length - 1];
  expect("loss releases every voice", duringLoss ? activeOf(duringLoss).size === 0 : false, duringLoss ? statesOf(duringLoss) : "missing");
  expect("recovery re-arms open fingers", afterLoss ? activeOf(afterLoss).size === 5 : false, afterLoss ? statesOf(afterLoss) : "missing");
}

console.log("13. unstable landmarks");
{
  const classifier = new FingerClassifier("right");
  classifier.configure(0.62, 0.42);
  const pose = allPose("open");
  let frame = 0;
  const frames = Array.from({ length: 24 }, () => {
    frame += 1;
    const hand = makeHand(pose, frame, { noise: 0.004 });
    // One finger jumps between two far positions every frame.
    const tip = hand.landmarks[8];
    if (tip) tip.y += frame % 2 === 0 ? 0.09 : -0.09;
    return hand;
  });
  const history = runFrames(classifier, frames);
  const unstableFrames = history.filter((readings) => readings.index.state === "UNSTABLE").length;
  expect("jumping index is never OPEN", history.every((readings) => !readings.index.active), statesOf(history[history.length - 1]!));
  expect("jumping index reports UNSTABLE at least once", unstableFrames > 0, `only ${unstableFrames} unstable frames`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
