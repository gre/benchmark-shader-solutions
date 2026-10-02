import { useEffect, useRef } from "react";
import { getPhases } from "./time";

/**
 * THE ONLY FILE a tech app replaces.
 *
 * Contract of an Effect:
 *  - fills the whole viewport (position: fixed, inset 0);
 *  - DPR-aware with cap 2: backing size = css size * min(devicePixelRatio, 2);
 *  - handles window resize (and DPR change);
 *  - is driven by the shell's requestAnimationFrame loop: each frame it reads
 *    the 4 phases via getPhases() (honours `?t=` freezing) and draws;
 *  - calls onFirstFrame() exactly once, right after its first frame is drawn
 *    (for the baseline, after the first rAF callback; for tech apps, after the
 *    first draw submitted, including any async lib/wasm/device init);
 *  - calls onFrame() after every drawn frame (feeds fps overlay / __frames).
 *
 * Baseline: a solid #1b1a33 element; the rAF loop still runs and reads phases.
 */
export default function Effect({ onFirstFrame, onFrame }: { onFirstFrame: () => void; onFrame: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let first = true;
    const loop = () => {
      const phases = getPhases();
      // A tech Effect would upload `phases` + resolution here and draw.
      if (ref.current) ref.current.dataset.p = phases[0].toFixed(4);
      if (first) {
        first = false;
        onFirstFrame();
      }
      onFrame();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onFirstFrame, onFrame]);

  return <div ref={ref} style={{ position: "fixed", inset: 0, background: "#1b1a33" }} />;
}
