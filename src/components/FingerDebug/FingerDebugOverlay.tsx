import { useState, useSyncExternalStore } from "react";
import {
  getFingerDebugSnapshot,
  requestRecalibration,
  subscribeFingerDebug,
} from "../../lib/finger-debug";
import type { FingerState } from "../../lib/finger-classifier";

const STATE_COLOR: Record<FingerState, string> = {
  OPEN: "#2E9E5B",
  CLOSED: "#8A8A85",
  PARTIALLY_OPEN: "#D9B23C",
  OCCLUDED: "#FF9B54",
  UNSTABLE: "#E04B3A",
  UNKNOWN: "#B6B1A6",
};

const FINGER_LABEL = {
  thumb: "THM",
  index: "IDX",
  middle: "MID",
  ring: "RNG",
  pinky: "PNK",
} as const;

/**
 * Development-only diagnostic overlay. It shows exactly why a fingertip is or
 * is not allowed to sound: state, confidence, geometry and activation.
 */
export function FingerDebugOverlay() {
  const snapshot = useSyncExternalStore(
    subscribeFingerDebug,
    getFingerDebugSnapshot,
    getFingerDebugSnapshot,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 left-3 z-[60] rounded-[3px] border-2 border-edge bg-surface px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink shadow-[2px_2px_0_var(--color-edge)]"
      >
        finger debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 left-3 z-[60] w-[340px] rounded-[4px] border-2 border-edge bg-surface/97 p-2 font-mono text-[9px] text-ink shadow-[4px_4px_0_var(--color-edge)]">
      <div className="flex items-center justify-between gap-2 border-b-2 border-edge pb-1">
        <span className="uppercase tracking-[0.18em]">finger recognition</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={requestRecalibration}
            className="rounded-[2px] border border-edge px-1 py-0.5 uppercase tracking-[0.1em]"
            title="Learn hand proportions from the next open hand"
          >
            calibrate
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-[2px] border border-edge px-1 py-0.5 uppercase tracking-[0.1em]"
          >
            hide
          </button>
        </div>
      </div>

      {snapshot.hands.length === 0 && (
        <p className="py-2 text-ink-faint">waiting for a hand…</p>
      )}

      {snapshot.hands.map((hand) => (
        <section key={hand.hand} className="mt-1.5">
          <div className="flex items-center justify-between text-ink-faint">
            <span className="uppercase tracking-[0.16em]">{hand.hand} hand</span>
            <span>
              {hand.present ? "tracked" : "absent"} · profile {hand.profileSamples}
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            {hand.readings.map((reading) => {
              const geometry = reading.geometry;
              const angles = geometry?.angles;
              return (
                <div
                  key={reading.finger}
                  className="grid grid-cols-[24px_62px_1fr_28px_42px_22px] items-center gap-1"
                  style={{ opacity: reading.visible ? 1 : 0.55 }}
                >
                  <span className="text-ink-faint">{FINGER_LABEL[reading.finger]}</span>
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-[1px] border border-edge"
                      style={{ background: STATE_COLOR[reading.state] }}
                    />
                    {reading.state}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="relative h-[3px] flex-1 overflow-hidden rounded-[1px] bg-line/50">
                      <span
                        className="absolute inset-y-0 left-0"
                        style={{
                          width: `${Math.round(reading.confidence * 100)}%`,
                          background: STATE_COLOR[reading.state],
                        }}
                      />
                    </span>
                    <span className="w-7 text-right text-ink-faint">
                      {Math.round(reading.confidence * 100)}
                    </span>
                  </span>
                  <span className="text-right text-ink-faint">
                    {Math.round(reading.extension * 100)}
                  </span>
                  <span className="text-right text-ink-faint">
                    {geometry
                      ? `${Math.round((angles?.mcp ?? 0) * 57.3)}/${Math.round(
                          (angles?.pip ?? 0) * 57.3,
                        )}/${Math.round((angles?.dip ?? 0) * 57.3)}`
                      : "—"}
                  </span>
                  <span
                    className="text-right uppercase"
                    style={{ color: reading.active ? STATE_COLOR.OPEN : "#B6B1A6" }}
                  >
                    {reading.active ? "on" : "—"}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[8px] uppercase tracking-[0.08em] text-ink-faint">
            ext% · angles mcp/pip/dip · on = voice
          </p>
        </section>
      ))}
    </div>
  );
}
