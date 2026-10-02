import { useEffect, useRef, useState } from "react";
import { loadCanvasKit } from "./canvaskit";
import SILK_SKSL from "./shaders/silk.sksl";
import { getPhases } from "./time";

/**
 * web-skia Effect: silk.sksl as a CanvasKit (canvaskit-wasm) RuntimeEffect,
 * drawn with drawPaint on a WebGL-backed Skia surface.
 * Contract: see web-baseline's Effect.tsx (fullscreen, DPR cap 2, resize,
 * shell rAF loop + getPhases(), onFirstFrame once incl. wasm load, onFrame).
 *
 * SkSL fragCoord is top-left in canvas units; the canvas backing store is in
 * physical px (css * min(DPR, 2)), so `resolution` = backing size.
 */

export default function Effect({ onFirstFrame, onFrame }: { onFirstFrame: () => void; onFrame: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Shader source as an effect dependency: when Vite HMR re-executes this
  // module after an edit of silk.sksl.ts, React Fast Refresh re-renders with
  // the new string and the effect re-initialises (recompiles) without reload.
  const sksl = SILK_SKSL;

  useEffect(() => {
    setError(null);
    const canvas = ref.current!;
    let disposed = false;
    let cleanup = () => {};

    loadCanvasKit().then((CK) => {
      if (disposed) return;
      const errors: string[] = [];
      const effect = CK.RuntimeEffect.Make(sksl, (e) => errors.push(e));
      if (!effect) {
        const msg = "SkSL compile error:\n" + errors.join("\n");
        console.error(msg);
        setError(msg);
        return;
      }

      const sizeCanvas = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        const changed = canvas.width !== w || canvas.height !== h;
        if (changed) {
          canvas.width = w;
          canvas.height = h;
        }
        return changed;
      };
      sizeCanvas();

      // One WebGL context + GrDirectContext for the lifetime of the effect;
      // only the Skia surface is recreated when the backing size changes.
      const glHandle = CK.GetWebGLContext(canvas);
      const gr = glHandle ? CK.MakeWebGLContext(glHandle) : null;
      if (!gr) {
        effect.delete();
        setError("WebGL context creation failed");
        return;
      }
      const makeSurface = () => CK.MakeOnScreenGLSurface(gr, canvas.width, canvas.height, CK.ColorSpace.SRGB);
      let surface = makeSurface();
      const paint = new CK.Paint();

      let raf = 0;
      let first = true;
      const loop = () => {
        if (sizeCanvas() || !surface) {
          surface?.delete();
          surface = makeSurface();
        }
        if (surface) {
          const shader = effect.makeShader([canvas.width, canvas.height, ...getPhases()]);
          paint.setShader(shader);
          surface.getCanvas().drawPaint(paint);
          surface.flush();
          shader.delete();
          if (first) {
            first = false;
            onFirstFrame();
          }
          onFrame();
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      cleanup = () => {
        cancelAnimationFrame(raf);
        paint.delete();
        surface?.delete();
        gr.delete();
        CK.deleteContext(glHandle);
        effect.delete();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [sksl, onFirstFrame, onFrame]);

  return (
    <>
      <canvas ref={ref} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", display: "block", background: "#000" }} />
      {error && (
        <pre style={{ position: "fixed", bottom: 0, left: 0, margin: 8, color: "#f88", font: "12px monospace", whiteSpace: "pre-wrap" }}>{error}</pre>
      )}
    </>
  );
}
