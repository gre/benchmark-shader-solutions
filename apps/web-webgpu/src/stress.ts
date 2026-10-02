/**
 * Opt-in STRESS MODE (shell only; identical in all 5 web apps).
 *   ?jsload=<ms>    every 100 ms, busy-loop <ms> ms on the main thread
 *   ?instances=<N>  render N independent Effect copies (see main.tsx)
 *   window.__stats() -> { fps, avgMs, p95Ms, frames } of the first instance's drawn frames, last 2 s
 * With no params nothing here is started: only a timestamp push per frame.
 */
const params = new URLSearchParams(location.search);

export const instances = Math.max(1, Math.floor(Number(params.get("instances")) || 1));
const jsload = Number(params.get("jsload")) || 0;

declare global {
  interface Window {
    __stats: () => { fps: number; avgMs: number; p95Ms: number; frames: number };
  }
}

const stamps: number[] = [];
/** Call once per drawn frame of the first instance. */
export const recordFrame = () => {
  const now = performance.now();
  stamps.push(now);
  while (stamps.length && stamps[0] < now - 2000) stamps.shift();
};

window.__stats = () => {
  const now = performance.now();
  const s = stamps.filter((t) => t >= now - 2000);
  if (s.length < 2) return { fps: 0, avgMs: 0, p95Ms: 0, frames: s.length };
  const dts: number[] = [];
  for (let i = 1; i < s.length; i++) dts.push(s[i] - s[i - 1]);
  dts.sort((a, b) => a - b);
  const avgMs = (s[s.length - 1] - s[0]) / dts.length;
  const p95Ms = dts[Math.min(dts.length - 1, Math.floor(dts.length * 0.95))];
  return { fps: 1000 / avgMs, avgMs, p95Ms, frames: s.length };
};

if (jsload > 0) {
  setInterval(() => {
    const end = performance.now() + jsload;
    while (performance.now() < end);
  }, 100);
}
