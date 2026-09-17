import type { CSSProperties } from "react";

/** Shared range-input styling for the cyan-filled sliders (volume, seek). */
export const sliderTrackClasses =
  "h-1 flex-1 cursor-pointer appearance-none rounded-full " +
  "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full " +
  "[&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none " +
  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-cyan [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--jarvis-surface-1)] " +
  "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full " +
  "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent-cyan";

export function sliderFillStyle(percent: number): CSSProperties {
  return {
    background: `linear-gradient(to right, var(--jarvis-cyan) ${percent}%, var(--jarvis-surface-2) ${percent}%)`,
  };
}
