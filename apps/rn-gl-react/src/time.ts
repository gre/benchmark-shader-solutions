// Animation clock + phases, shared contract of shaders/silk.glsl:
//   phase = vec4(fract(t/41), fract(t/59), fract(t/23), fract(t/53))
// computed in JS doubles so the shader never sees large time values.
import { FROZEN_TIME } from './config';

export const PERIODS = [41, 59, 23, 53] as const;

export type Phases = [number, number, number, number];

// Positive modulo in [0,1), double precision. Worklet-safe (pure).
export function phasesAt(t: number): Phases {
  'worklet';
  return [
    (((t / 41) % 1) + 1) % 1,
    (((t / 59) % 1) + 1) % 1,
    (((t / 23) % 1) + 1) % 1,
    (((t / 53) % 1) + 1) % 1,
  ];
}

// --- JS thread -----------------------------------------------------------
const jsStart = performance.now();

/** Elapsed seconds since this module was loaded (or FROZEN_TIME). JS thread. */
export function elapsedSeconds(nowMs: number = performance.now()): number {
  return FROZEN_TIME ?? (nowMs - jsStart) / 1000;
}

/** Phases for "now" on the JS thread (e.g. inside requestAnimationFrame). */
export function currentPhases(nowMs?: number): Phases {
  return phasesAt(elapsedSeconds(nowMs));
}

// --- UI thread (Reanimated worklets) -------------------------------------
const frozen: number | null = FROZEN_TIME; // captured by value in worklets

/**
 * Elapsed seconds on the UI thread, from Reanimated's FrameInfo
 * (`useFrameCallback(({ timeSinceFirstFrame }) => ...)`) or FROZEN_TIME.
 */
export function elapsedSecondsUI(timeSinceFirstFrameMs: number): number {
  'worklet';
  return frozen ?? timeSinceFirstFrameMs / 1000;
}

/** Phases on the UI thread. */
export function phasesUI(timeSinceFirstFrameMs: number): Phases {
  'worklet';
  return phasesAt(elapsedSecondsUI(timeSinceFirstFrameMs));
}
