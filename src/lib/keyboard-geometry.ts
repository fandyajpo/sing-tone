export const WAVE_STRIP_HEIGHT = 58;
export const LABEL_ROW_HEIGHT = 26;

export interface KeyboardMetrics {
  /** Top edge of the glowing key band, in CSS pixels from the viewport top. */
  top: number;
  /** Bottom edge of the key band. */
  bottom: number;
  height: number;
  width: number;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function keyboardMetrics(width: number, height: number): KeyboardMetrics {
  const bandHeight = Math.round(clamp(height * 0.16, 58, 124));
  const bottom = height - WAVE_STRIP_HEIGHT - LABEL_ROW_HEIGHT;
  return { top: bottom - bandHeight, bottom, height: bandHeight, width };
}
