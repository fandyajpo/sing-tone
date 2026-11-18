import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { KeyboardEvent } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Small trailing detail, e.g. a note range. */
  hint?: string;
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Tiny label in the top-right corner of the field header. */
  meta?: string;
  /** Helper line under the field. */
  caption?: string;
}

/**
 * Custom listbox. Native selects cannot be styled past the closed control, so
 * the whole dropdown is ours: same trigger, menu and focus treatment as every
 * other control in the instrument.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  meta,
  caption,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((option) => option.value === value);
  const current = options[selectedIndex < 0 ? 0 : selectedIndex];

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  /**
   * The rails scroll, so a menu placed inside them would be clipped. The list
   * is portalled to the body and positioned from the trigger instead.
   */
  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = Math.min(250, options.length * 34 + 10);
    const openUp = rect.bottom + menuHeight + 10 > window.innerHeight && rect.top > menuHeight;
    setAnchor({
      top: openUp ? rect.top - menuHeight - 6 : rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - rect.width - 8),
      width: rect.width,
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => measure();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    setActive(selectedIndex < 0 ? 0 : selectedIndex);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [open, active]);

  const commit = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    close(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => (index + 1) % options.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => (index - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        commit(active);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="flex flex-col gap-1.5" onKeyDown={onKeyDown}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] uppercase tracking-[0.24em] text-ink-faint">{label}</span>
        {meta && (
          <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-gold/80">{meta}</span>
        )}
      </div>

      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={label}
          onClick={() => setOpen((value) => !value)}
          data-open={open}
          className="field-trigger"
        >
          <span className="truncate">{current?.label ?? "—"}</span>
          <Chevron open={open} />
        </button>

        {open && anchor && createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="menu"
            style={{ position: "fixed", top: anchor.top, left: anchor.left, width: anchor.width }}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  data-active={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => commit(index)}
                  className="menu-item"
                >
                  <span className="truncate">{option.label}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {option.hint && (
                      <span className="font-mono text-[9px] tracking-[0.04em] text-ink-faint">
                        {option.hint}
                      </span>
                    )}
                    {isSelected && <Check />}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
      </div>

      {caption && <span className="text-[10px] leading-snug text-ink-faint">{caption}</span>}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 text-gold/80 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path d="M1.5 3.5 5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="text-gold">
      <path d="M1.5 5.2 3.9 7.6 8.5 2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
