// Effect.web.tsx — @shader-bench/native on the web: raw WebGL 1 (GLSL), no lib.
//
// - The canvas fills the element styled by `style` (absolutely positioned
//   inside a relative wrapper), backing size = css size * min(DPR, 2).
// - Own requestAnimationFrame loop; the clock integrates speed
//   (t += dt * speed) so changing speed never jumps; speed 0 freezes t
//   (t = 0 when speed is 0 from the start) and stops redrawing until a
//   param or the size changes.
// - Uniforms: resolution (backing px), phase (CPU, double), params (vec4[4]).
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import {
  computePhases,
  getShader,
  packParams,
  paramsKey,
  resolveParams,
  MAX_PARAMS,
  type ParamValues,
  type ShaderDef,
} from "./registry";
import "./shaders";
import type { EffectBaseProps } from "./types";

export type { ShaderName } from "./shaders";

export type EffectProps = EffectBaseProps & { style?: CSSProperties };

const MAX_PIXEL_RATIO = 2;
const VS = "attribute vec2 pos; void main(){ gl_Position = vec4(pos, 0.0, 1.0); }";

type GLState = {
  gl: WebGLRenderingContext;
  prog: WebGLProgram;
  uRes: WebGLUniformLocation | null;
  uPhase: WebGLUniformLocation | null;
  uParams: WebGLUniformLocation | null;
};

function setup(canvas: HTMLCanvasElement, def: ShaderDef): GLState {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, stencil: false });
  if (!gl) throw new Error("WebGL is not available");
  const src = def.sources.glsl;
  if (!src) throw new Error(`shader ${def.name} has no GLSL source`);
  const compile = (type: number, s: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, s);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "compile error");
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, src));
  gl.bindAttribLocation(prog, 0, "pos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link error");
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(prog);
  return {
    gl,
    prog,
    uRes: gl.getUniformLocation(prog, "resolution"),
    uPhase: gl.getUniformLocation(prog, "phase"),
    uParams: gl.getUniformLocation(prog, "params"),
  };
}

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
    let st: GLState;
    try {
      st = setup(canvas, def);
    } catch (e) {
      console.error(`[@shader-bench/native] ${def.name}:`, e);
      return;
    }
    const { gl } = st;
    const packed = new Float32Array(MAX_PARAMS);
    let t = 0;
    let last = performance.now();
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        live.current.dirty = true;
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const v = live.current.values;
      t += ((now - last) / 1000) * v.speed;
      last = now;
      if (v.speed === 0 && !live.current.dirty) return;
      live.current.dirty = false;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(st.uRes, canvas.width, canvas.height);
      const ph = computePhases(def, t);
      gl.uniform4f(st.uPhase, ph[0], ph[1], ph[2], ph[3]);
      if (st.uParams) gl.uniform4fv(st.uParams, packParams(def, v, packed));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(st.prog);
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
