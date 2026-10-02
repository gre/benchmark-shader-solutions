// Effect.web.tsx — @shader-bench/gl-react on the web: gl-react 6 +
// gl-react-dom 6 (GLSL), adapted from apps/web-gl-react.
//
// - <Surface width height pixelRatio> sized from the wrapper element styled by
//   `style` (ResizeObserver); pixel ratio = min(DPR, 2); no MSAA.
// - Uniforms are React props (gl-react's model): a requestAnimationFrame loop
//   integrates t += dt * speed and re-renders <Node uniforms> every frame;
//   speed 0 stops the loop (one render per param/size change).
// - resolution = Uniform.Resolution (the framebuffer size in px), phase,
//   params (4 vec4 = the 16 packed floats).
import "./global-shim"; // must stay the first import (see global-shim.ts)
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { GLSL, Node, Shaders, Uniform } from "gl-react";
import { Surface } from "gl-react-dom";
import { computePhases, getShader, packParams, paramsKey, resolveParams, type ShaderDef } from "./registry";
import "./shaders";
import type { EffectBaseProps } from "./types";

export type { ShaderName } from "./shaders";

export type EffectProps = EffectBaseProps & { style?: CSSProperties };

const MAX_PIXEL_RATIO = 2;

const glShaders = new Map<string, ReturnType<typeof Shaders.create>[string]>();
function glShader(def: ShaderDef) {
  if (!glShaders.has(def.name)) {
    glShaders.set(def.name, Shaders.create({ [def.name]: { frag: GLSL`${def.sources.glsl ?? ""}` } })[def.name]);
  }
  return glShaders.get(def.name)!;
}

const vec4s = (a: Float32Array) => [0, 1, 2, 3].map((i) => Array.from(a.subarray(i * 4, i * 4 + 4)));

export function Effect({ shader, params, style }: EffectProps) {
  const def = getShader(shader);
  const key = paramsKey(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const values = useMemo(() => resolveParams(def, params), [def, key]);
  const packed = useMemo(() => vec4s(packParams(def, values)), [def, values]);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });
  const [t, setT] = useState(0);
  const speed = values.speed;

  useEffect(() => {
    const el = ref.current!;
    const measure = () =>
      setSize({ w: el.clientWidth, h: el.clientHeight, dpr: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO) });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (speed === 0) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((x) => x + dt * speed);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  return (
    <div ref={ref} style={{ position: "relative", overflow: "hidden", ...style }}>
      {size.w > 0 && size.h > 0 && (
        <Surface
          width={size.w}
          height={size.h}
          pixelRatio={size.dpr}
          style={{ position: "absolute", left: 0, top: 0 }}
          webglContextAttributes={{ antialias: false, alpha: false, preserveDrawingBuffer: false }}
        >
          <Node
            shader={glShader(def)}
            uniforms={{ resolution: Uniform.Resolution, phase: computePhases(def, t), params: packed }}
          />
        </Surface>
      )}
    </div>
  );
}

export default Effect;
