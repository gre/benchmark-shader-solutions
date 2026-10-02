import { useEffect, useState } from "react";

/** Shows fps, avg and p95 frame time over the last 2 s (own rAF sampler). */
export default function FpsOverlay() {
  const [text, setText] = useState("…");

  useEffect(() => {
    const samples: { t: number; dt: number }[] = [];
    let last = performance.now();
    let raf = 0;
    let lastUi = 0;
    const loop = (now: number) => {
      samples.push({ t: now, dt: now - last });
      last = now;
      while (samples.length && samples[0].t < now - 2000) samples.shift();
      if (now - lastUi > 250 && samples.length > 1) {
        lastUi = now;
        const dts = samples.map((s) => s.dt).sort((a, b) => a - b);
        const avg = dts.reduce((a, b) => a + b, 0) / dts.length;
        const p95 = dts[Math.min(dts.length - 1, Math.floor(dts.length * 0.95))];
        setText(`${(1000 / avg).toFixed(1)} fps\navg ${avg.toFixed(2)} ms\np95 ${p95.toFixed(2)} ms\n(rAF, main thread)`);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <pre
      style={{
        position: "fixed", top: 8, left: 8, margin: 0, padding: "6px 10px", zIndex: 10,
        font: "12px/1.4 ui-monospace, Menlo, monospace", color: "#fff",
        background: "rgba(0,0,0,0.6)", borderRadius: 6, pointerEvents: "none",
      }}
    >
      {text}
    </pre>
  );
}
