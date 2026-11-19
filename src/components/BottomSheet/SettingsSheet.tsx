import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

/** Height of the always-visible header while the sheet is closed. */
const PEEK = 92;

interface SettingsSheetProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/**
 * Mobile-only settings drawer. It rests as a peek bar over the fullscreen
 * camera, follows the finger while dragged, and snaps open or closed on
 * release. Desktop never shows it.
 */
export function SettingsSheet({ title, subtitle, children }: SettingsSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef(0);
  const pointerId = useRef<number | null>(null);

  const [open, setOpen] = useState(false);
  const [travel, setTravel] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const height = sheetRef.current?.offsetHeight ?? 0;
      setTravel(Math.max(0, height - PEEK));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const base = open ? 0 : travel;
  const offset = drag === null ? base : Math.min(travel, Math.max(0, base + drag));

  const handleDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointerId.current = event.pointerId;
    startY.current = event.clientY;
    setDrag(0);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that ended before capture is fine: the drag just won't lock.
    }
  }, []);

  const handleMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId) return;
    setDrag(event.clientY - startY.current);
  }, []);

  const handleUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerId.current !== event.pointerId) return;
      pointerId.current = null;
      const moved = event.clientY - startY.current;
      setDrag(null);
      if (Math.abs(moved) < 6) {
        setOpen((current) => !current);
        return;
      }
      setOpen(Math.min(travel, Math.max(0, base + moved)) < travel * 0.5);
    },
    [base, travel],
  );

  return (
    <div
      ref={sheetRef}
      className="fixed inset-x-0 bottom-0 z-40 flex h-[80dvh] flex-col rounded-t-[10px] border-2 border-b-0 border-edge bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      style={{
        transform: `translateY(${offset}px)`,
        boxShadow: "0 -5px 0 var(--color-edge)",
        transition: drag === null ? "transform 420ms cubic-bezier(0.22, 1, 0.24, 1)" : "none",
      }}
      aria-expanded={open}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={open ? "Collapse settings" : "Expand settings"}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
        className="flex shrink-0 cursor-grab touch-none flex-col gap-2 px-4 pb-2.5 pt-2.5 active:cursor-grabbing"
      >
        <span className="mx-auto h-1.5 w-12 rounded-[2px] border-2 border-edge bg-gold" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-gold">
              {title}
            </p>
            <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
              {subtitle}
            </p>
          </div>
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-[4px] border-2 border-edge bg-paper-soft text-gold transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          >
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 5 5 1l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain border-t-2 border-edge/60 px-3 pb-8 pt-3">
        <div className="flex flex-col gap-2.5">{children}</div>
      </div>
    </div>
  );
}
