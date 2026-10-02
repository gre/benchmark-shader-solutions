import { useEffect, useRef, useState } from "react";
import { getPhases } from "./time";
import silk from "./shaders/silk.glsl";

/**
 * THE ONLY FILE a tech app replaces. Raw WebGL 1, no library.
 *
 * Contract of an Effect:
 *  - fills the whole viewport (position: fixed, inset 0);
 *  - DPR-aware with cap 2: backing size = css size * min(devicePixelRatio, 2);
 *  - handles window resize (and DPR change);
 *  - driven by a requestAnimationFrame loop: each frame reads getPhases()
 *    (honours `?t=`) and draws;
 *  - onFirstFrame() once after the first draw; onFrame() after every draw.
 * Also: context loss/restore, shader compile/link errors shown on the page.
 * The shader source is an effect dependency so Vite HMR edits re-run the effect.
 */
const VS = "attribute vec2 pos; void main(){ gl_Position = vec4(pos, 0.0, 1.0); }";

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) || "unknown error";
    gl.deleteShader(s);
    throw new Error((type === gl.VERTEX_SHADER ? "vertex" : "fragment") + " shader compile error:\n" + log);
  }
  return s;
}

function build(gl: WebGLRenderingContext, fsSrc: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.bindAttribLocation(p, 0, "pos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("program link error:\n" + gl.getProgramInfoLog(p));
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return { p, resolution: gl.getUniformLocation(p, "resolution"), phase: gl.getUniformLocation(p, "phase") };
}

export default function Effect({ onFirstFrame, onFrame }: { onFirstFrame: () => void; onFrame: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl", { antialias: false })!;
    if (!gl) {
      setError("WebGL 1 not available");
      return;
    }
    let raf = 0;
    let first = true;
    let prog: ReturnType<typeof build> | null = null;
    let lost = false;

    const init = () => {
      try {
        prog = build(gl, silk);
        setError(null);
      } catch (e) {
        prog = null;
        setError((e as Error).message);
      }
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (lost || !prog) return;
      resize();
      const ph = getPhases();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog.p);
      gl.uniform2f(prog.resolution, canvas.width, canvas.height);
      gl.uniform4f(prog.phase, ph[0], ph[1], ph[2], ph[3]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (first) {
        first = false;
        onFirstFrame();
      }
      onFrame();
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
    };
    const onRestored = () => {
      lost = false;
      init();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    window.addEventListener("resize", resize);
    init();
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      window.removeEventListener("resize", resize);
      // WebGL contexts are per-canvas and cannot be re-created with other attributes: the canvas is remounted via key.
    };
  }, [onFirstFrame, onFrame, silk]);

  return (
    <>
      <canvas key={silk} ref={ref} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", display: "block" }} />
      {error && (
        <pre style={{ position: "fixed", left: 0, right: 0, bottom: 0, margin: 0, padding: 8, zIndex: 10, maxHeight: "50vh", overflow: "auto", color: "#f88", background: "rgba(32,0,0,.92)", font: "12px monospace", whiteSpace: "pre-wrap" }}>
          {error}
        </pre>
      )}
    </>
  );
}
