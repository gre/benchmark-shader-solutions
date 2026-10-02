/**
 * Stress mode (shell, identical in every RN app). Opt-in, read at RUNTIME
 * from iOS NSUserDefaults through RN's `Settings` module, so one Release build
 * serves every setting. The argument domain is included, so:
 *
 *   xcrun simctl launch <dev> <bundleId> -jsload 50 -instances 4 -stats 1
 *
 * (Persisted alternative: `xcrun simctl spawn <dev> defaults write <bundleId>
 * jsload -int 50`.) Absent keys -> defaults (jsload 0, instances 1, stats off)
 * = the normal app. Android: no Settings module -> always the defaults.
 *
 *  - jsload (ms): every 100 ms, busy-loop that many ms on the JS thread.
 *  - instances (N): N independent <Effect/> copies stacked full-screen, every
 *    copy above the bottom one at opacity 0.5 (see App.tsx).
 *  - stats (1/0): every 2 s, console.log one line
 *      [stats] effect_fps=<n> effect_p95=<ms> js_fps=<n> ui_fps=<n>
 *    effect_*: frames drawn by the FIRST (bottom) instance (what is counted
 *    depends on the tech: see the header of src/Effect.tsx / README);
 *    js/ui: the FpsOverlay measurement (rAF / Reanimated frame callback),
 *    which keeps running while the overlay is hidden when stats is on.
 *    All numbers are over a sliding 2 s window (rn-native's native stats: 1 s).
 */
import { Platform, Settings } from 'react-native';
import { makeMutable } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

function readNumber(key: string, fallback: number): number {
  if (Platform.OS !== 'ios') {
    return fallback;
  }
  try {
    const v = Settings.get(key);
    if (v == null || v === '') {
      return fallback;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export const STRESS = {
  jsload: Math.max(0, readNumber('jsload', 0)),
  instances: Math.max(1, Math.floor(readNumber('instances', 1))),
  stats: readNumber('stats', 0) !== 0,
};

// ---------------------------------------------------------------------------
// Frame-time statistics over a sliding window (also used by FpsOverlay).
export const WINDOW_MS = 2000;
export const PUSH_MS = 500;

export type Stats = { fps: number; avg: number; p95: number; n: number };
export const EMPTY: Stats = { fps: 0, avg: 0, p95: 0, n: 0 };

// times: frame timestamps (ms) inside the window, ascending.
export function statsOf(times: number[]): Stats {
  'worklet';
  const n = times.length - 1;
  if (n < 1) {
    return { fps: 0, avg: 0, p95: 0, n: 0 };
  }
  const deltas: number[] = [];
  for (let i = 1; i < times.length; i++) {
    deltas.push(times[i] - times[i - 1]);
  }
  const span = times[times.length - 1] - times[0];
  deltas.sort((a, b) => a - b);
  const p95 = deltas[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
  return { fps: (n * 1000) / span, avg: span / n, p95, n };
}

export function pushTime(times: number[], now: number) {
  'worklet';
  times.push(now);
  while (times.length > 0 && now - times[0] > WINDOW_MS) {
    times.shift();
  }
}

// ---------------------------------------------------------------------------
// Latest stats per source, stamped with their JS arrival time. A source that
// stopped reporting for > STALE_MS is printed as 0 fps, unless the JS thread
// itself was blocked during that time (then UI / native samples could not be
// delivered, and the last known values are printed).
const STALE_MS = 2500;
const JS_GAP_MS = 250;
let jsLastTick = 0;
let jsAliveSince = 0;
/** Called by FpsOverlay's JS rAF loop on every JS frame (stats on). */
export function jsFrameTick(now: number) {
  if (now - jsLastTick > JS_GAP_MS) {
    jsAliveSince = now;
  }
  jsLastTick = now;
}
type Sample = { s: Stats; at: number };
const latest: Record<'effect' | 'js' | 'ui', Sample | null> = {
  effect: null,
  js: null,
  ui: null,
};

export function reportStats(source: 'effect' | 'js' | 'ui', s: Stats) {
  latest[source] = { s, at: performance.now() };
}

/** Effect frame drawn, signalled on the JS thread (gl-react onDraw). */
let jsTimes: number[] | null = null; // stats computed when printing
export function effectFrameJS(now: number = performance.now()) {
  jsTimes = jsTimes ?? [];
  pushTime(jsTimes, now);
}

/** Effect frame drawn, signalled on the UI thread (worklet). `now` in ms. */
const uiTimes = makeMutable<number[]>([]);
const uiLastPush = makeMutable(0);
const reportEffect = (s: Stats) => reportStats('effect', s);
export function effectFrameUI(now: number) {
  'worklet';
  uiTimes.modify(times => {
    'worklet';
    pushTime(times, now);
    return times;
  });
  if (now - uiLastPush.value > PUSH_MS) {
    uiLastPush.value = now;
    scheduleOnRN(reportEffect, statsOf(uiTimes.value));
  }
}

/** Stats computed natively (rn-native onFrameStats: fps / p95 over ~1 s). */
export function effectStatsNative(fps: number, p95Ms: number) {
  reportStats('effect', { fps, avg: fps > 0 ? 1000 / fps : 0, p95: p95Ms, n: 1 });
}

// ---------------------------------------------------------------------------
/** Starts the jsload busy loop and the [stats] logger; returns a stop(). */
export function startStress(): () => void {
  const timers: ReturnType<typeof setInterval>[] = [];
  if (STRESS.jsload > 0) {
    const ms = STRESS.jsload;
    timers.push(
      setInterval(() => {
        const end = performance.now() + ms;
        while (performance.now() < end) {
          // busy
        }
      }, 100),
    );
  }
  if (STRESS.stats) {
    console.log(
      `[stress] jsload=${STRESS.jsload} instances=${STRESS.instances} stats=1`,
    );
    timers.push(
      setInterval(() => {
        const now = performance.now();
        const jsBlocked = now - jsAliveSince < STALE_MS;
        const get = (k: 'effect' | 'js' | 'ui') => {
          const l = latest[k];
          return l && (now - l.at <= STALE_MS || (k !== 'js' && jsBlocked))
            ? l.s
            : EMPTY;
        };
        const e = jsTimes
          ? statsOf(jsTimes.filter(t => now - t <= WINDOW_MS))
          : get('effect');
        console.log(
          `[stats] effect_fps=${e.fps.toFixed(1)} effect_p95=${e.p95.toFixed(1)} js_fps=${get(
            'js',
          ).fps.toFixed(1)} ui_fps=${get('ui').fps.toFixed(1)}`,
        );
      }, 2000),
    );
  }
  return () => timers.forEach(clearInterval);
}
