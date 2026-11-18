/**
 * Copies the MediaPipe wasm runtime out of node_modules and downloads the
 * hand landmarker model into public/, so tracking works fully offline and
 * never depends on a third-party CDN at runtime.
 */
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wasmSource = path.join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmTarget = path.join(root, "public/mediapipe/wasm");
const modelTarget = path.join(root, "public/models/hand_landmarker.task");
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

async function main() {
  await mkdir(wasmTarget, { recursive: true });
  await cp(wasmSource, wasmTarget, { recursive: true });

  const hasModel = existsSync(modelTarget) && (await stat(modelTarget)).size > 1_000_000;
  if (!hasModel) {
    await mkdir(path.dirname(modelTarget), { recursive: true });
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error(`Model download failed with status ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(modelTarget, bytes);
  }

  console.log(`MediaPipe assets ready: ${path.relative(root, wasmTarget)}, ${path.relative(root, modelTarget)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
