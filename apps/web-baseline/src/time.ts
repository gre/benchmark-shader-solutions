// Elapsed-seconds clock and animation phases (uniform contract of silk.glsl).

/** Periods in seconds of the 4 phases: curve A, curve B, rim glow, hue drift. */
export const PERIODS = [41, 59, 23, 53] as const;

const t0 = performance.now();
const frozen = new URLSearchParams(location.search).get("t");
const FROZEN: number | null = frozen !== null && frozen !== "" && !isNaN(Number(frozen)) ? Number(frozen) : null;

/** Elapsed seconds since page load, or the `?t=<seconds>` value when frozen. */
export function getTime(): number {
  return FROZEN !== null ? FROZEN : (performance.now() - t0) / 1000;
}

/** Phases in [0,1), computed in JS doubles: ((t / P) % 1 + 1) % 1. */
export function getPhases(t: number = getTime()): [number, number, number, number] {
  return PERIODS.map((p) => (((t / p) % 1) + 1) % 1) as [number, number, number, number];
}
