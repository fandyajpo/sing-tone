import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "solid" | "gold" | "outline" | "quiet";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  solid: "border border-gold/70 bg-gold text-paper hover:bg-gold-soft",
  gold: "border border-bronze/70 bg-gold/10 text-gold-soft hover:bg-gold/[0.18]",
  outline:
    "border border-line bg-paper-soft/70 text-ink-soft hover:border-bronze hover:text-ink",
  quiet: "border border-transparent text-ink-faint hover:text-ink",
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
