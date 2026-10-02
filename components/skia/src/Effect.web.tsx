// Effect.web.tsx — @shader-bench/skia on the web: CanvasKit (canvaskit-wasm)
// SkSL RuntimeEffect drawn with drawPaint on a WebGL-backed Skia surface
// (adapted from apps/web-skia).
//
// - The canvas fills the element styled by `style` (absolutely positioned
//   inside a relative wrapper), backing size = css size * min(DPR, 2);
//   `resolution` = backing size (SkSL fragCoord is in canvas units = px here).
// - One WebGL context + GrDirectContext per mount; only the Skia surface is
//   recreated when the backing size changes. Every wasm object is deleted.
// - Own requestAnimationFrame loop; t += dt * speed (speed 0 freezes and
//   stops redrawing until a param or the size changes).
// - Uniforms in declaration order: resolution, phase, params (16 floats).
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { loadCanvasKit } from "./canvaskit";
import { computePhases, getShader, packParams, paramsKey, resolveParams, MAX_PARAMS, type ParamValues } from "./registry";
import "./shaders";
import type { EffectBaseProps } from "./types";

export type { ShaderName } from "./shaders";

export type EffectProps = EffectBaseProps & { style?: CSSProperties };

const MAX_PIXEL_RATIO = 2;

export function Effect({ shader, params, style }: EffectProps) {
  const def = getShader(shader);
  const key = paramsKey(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const values = useMemo(() => resolveParams(def, params), [def, key]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ values: ParamValues; dirty: boolean }>({ values, dirty: true });
  live.current.values = values;
  live.current.dirty = true;

  useEffect(() => {
    const canvas = canvasRef.current!;
    let disposed = false;
    let cleanup = () => {};

    loadCanvasKit().then((CK) => {
      if (disposed) return;
      const src = def.sources.sksl;
      const errors: string[] = [];
      const effect = src ? CK.RuntimeEffect.Make(src, (e) => errors.push(e)) : null;
      if (!effect) {
        console.error(`[@shader-bench/skia] ${def.name}: SkSL error`, errors.join("\n"));
        return;
      }
      const sizeCanvas = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width === w && canvas.height === h) return false;
        canvas.width = w;
        canvas.height = h;
        return true;
      };
      sizeCanvas();
      const glHandle = CK.GetWebGLContext(canvas);
      const gr = glHandle ? CK.MakeWebGLContext(glHandle) : null;
      if (!gr) {
        effect.delete();
        console.error("[@shader-bench/skia] WebGL context creation failed");
        return;
      }
      const makeSurface = () => CK.MakeOnScreenGLSurface(gr, canvas.width, canvas.height, CK.ColorSpace.SRGB);
      let surface = makeSurface();
      const paint = new CK.Paint();
      const packed = new Float32Array(MAX_PARAMS);
      const uniforms = new Float32Array(8 + MAX_PARAMS);
      let t = 0;
      let last = performance.now();
      let raf = 0;

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const v = live.current.values;
        t += ((now - last) / 1000) * v.speed;
        last = now;
        if (sizeCanvas() || !surface) {
          surface?.delete();
          surface = makeSurface();
          live.current.dirty = true;
        }
        if (!surface || (v.speed === 0 && !live.current.dirty)) return;
        live.current.dirty = false;
        uniforms[0] = canvas.width;
        uniforms[1] = canvas.height;
        uniforms.set(computePhases(def, t), 2);
        uniforms.set(packParams(def, v, packed), 6);
        const sh = effect.makeShader(uniforms.subarray(0, 6 + MAX_PARAMS));
        paint.setShader(sh);
        surface.getCanvas().drawPaint(paint);
        surface.flush();
        sh.delete();
      };
      raf = requestAnimationFrame(frame);

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
  }, [def]);

  return (
    <div style={{ position: "relative", overflow: "hidden", ...style }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}

export default Effect;
