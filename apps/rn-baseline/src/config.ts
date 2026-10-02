// Freeze the animation clock for screenshots: set a number of seconds
// (e.g. 0, 10, 30) and reload (Debug: press r in Metro / Cmd+R; Release: rebuild).
// null = live clock.
export const FROZEN_TIME: number | null = null;

// Max device pixel ratio used by GPU effects (render-target size =
// layout size * min(PixelRatio.get(), MAX_PIXEL_RATIO)).
export const MAX_PIXEL_RATIO = 2;

// FPS overlay visible at launch (it is toggled by tapping the screen; this
// flag exists for automation — Xcode 27 ships no Simulator.app to tap in,
// and `simctl` cannot send touches).
export const FPS_OVERLAY_AT_START = false;
