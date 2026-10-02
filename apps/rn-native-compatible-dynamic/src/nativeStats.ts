// Tiny pub/sub carrying <SilkView>'s native onFrameStats to the FPS overlay
// (keeps App.tsx identical to the other RN apps).
export type NativeStats = { fps: number; avgMs: number; p95Ms: number };

const listeners = new Set<(s: NativeStats) => void>();

export function publishNativeStats(s: NativeStats) {
  listeners.forEach(l => l(s));
}

export function subscribeNativeStats(l: (s: NativeStats) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
