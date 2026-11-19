import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "solid" | "gold" | "outline" | "quiet";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  solid: "border-2 border-edge bg-gold text-paper hover:bg-gold-soft",
  gold: "border-2 border-edge bg-bronze text-paper hover:bg-gold",
  outline:
    "border-2 border-edge bg-paper-soft text-ink hover:bg-surface-raised hover:text-ink",
  quiet: "btn-quiet border-2 border-transparent text-ink-soft hover:text-ink",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1.5 text-[9px] tracking-[0.22em]",
  md: "px-3.5 py-2 text-[10px] tracking-[0.24em]",
  lg: "px-7 py-3.5 text-[10px] tracking-[0.3em]",
};

/** One button, four moods. Every control in the instrument uses this. */
export function Button({
  variant = "outline",
  size = "md",
  block = false,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn ${VARIANTS[variant]} ${SIZES[size]} ${block ? "w-full" : ""} ${className}`}
      {...rest}
    />
  );
}
