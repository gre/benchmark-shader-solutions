/// <reference types="@webgpu/types" />
// Effect.web.tsx — @shader-bench/webgpu on the web: raw WebGPU (WGSL), no lib
// (adapted from apps/web-webgpu).
//
// - The canvas fills the element styled by `style` (absolutely positioned
//   inside a relative wrapper), backing size = css size * min(DPR, 2)
//   (checked every frame; clamped to maxTextureDimension2D).
// - One device per mount; WGSL compile errors (getCompilationInfo), pipeline
//   validation errors and uncaptured errors go to console.error; device loss
//   re-initialises (max 3 times). Without WebGPU the box stays #1b1a33.
// - Own requestAnimationFrame loop; t += dt * speed (speed 0 freezes and
//   stops redrawing until a param or the size changes).
// - One 96-byte uniform buffer = packUniforms() (resolution, pad, phase,
//   params[4]) at group 0 binding 0.
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { getShader, packUniforms, paramsKey, resolveParams, UNIFORM_BYTES, UNIFORM_FLOATS, type ParamValues } from "./registry";
import "./shaders";
import type { EffectBaseProps } from "./types";

export type { ShaderName } from "./shaders";

export type EffectProps = EffectBaseProps & { style?: CSSProperties };

const MAX_PIXEL_RATIO = 2;
const TAG = "[@shader-bench/webgpu]";

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
    const code = def.sources.wgsl;
    let disposed = false;
    let raf = 0;
    let device: GPUDevice | null = null;
    let restarts = 0;
    const fail = (msg: string) => console.error(TAG, `${def.name}:`, msg);

    async function init() {
      if (!code) return fail("no WGSL source");
      if (!navigator.gpu) return fail("WebGPU is unavailable (navigator.gpu is undefined)");
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return fail("WebGPU is unavailable: no adapter");
      const dev = await adapter.requestDevice();
      if (disposed) return dev.destroy();
      device = dev;
      dev.lost.then((info) => {
        if (disposed || info.reason === "destroyed") return;
        cancelAnimationFrame(raf);
        if (restarts++ < 3) init().catch((e) => fail(String(e?.message ?? e)));
        else fail(`device lost: ${info.message}`);
      });
      dev.addEventListener("uncapturederror", (e) => fail(`WebGPU error: ${(e as GPUUncapturedErrorEvent).error.message}`));

      const ctx = canvas.getContext("webgpu");
      if (!ctx) return fail("canvas.getContext('webgpu') returned null");
      const format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device: dev, format, alphaMode: "opaque" });

      dev.pushErrorScope("validation");
      const module = dev.createShaderModule({ label: `${def.name}.wgsl`, code });
      const info = await module.getCompilationInfo();
      await dev.popErrorScope();
      const errors = info.messages.filter((m) => m.type === "error");
      if (errors.length) {
        return fail("WGSL compilation failed:\n" + errors.map((m) => `${def.name}.wgsl:${m.lineNum}:${m.linePos} ${m.message}`).join("\n"));
      }
      dev.pushErrorScope("validation");
      const pipeline = dev.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vs_main" },
        fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });
      const ubo = dev.createBuffer({ size: UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const bindGroup = dev.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: ubo } }],
      });
      const pipeErr = await dev.popErrorScope();
      if (pipeErr) return fail(`pipeline error: ${pipeErr.message}`);
      if (disposed) return;

      const data = new Float32Array(UNIFORM_FLOATS);
      const maxDim = dev.limits.maxTextureDimension2D;
      let t = 0;
      let last = performance.now();
      live.current.dirty = true;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const v = live.current.values;
        t += ((now - last) / 1000) * v.speed;
        last = now;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        const w = Math.min(maxDim, Math.max(1, Math.round(canvas.clientWidth * dpr)));
        const h = Math.min(maxDim, Math.max(1, Math.round(canvas.clientHeight * dpr)));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          live.current.dirty = true;
        }
        if (v.speed === 0 && !live.current.dirty) return;
        live.current.dirty = false;
        dev.queue.writeBuffer(ubo, 0, packUniforms(def, { width: w, height: h, t, params: v }, data));
        const enc = dev.createCommandEncoder();
        const pass = enc.beginRenderPass({
          colorAttachments: [
            { view: ctx.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
        dev.queue.submit([enc.finish()]);
      };
      raf = requestAnimationFrame(frame);
    }

    init().catch((e) => fail(String(e?.message ?? e)));
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      device?.destroy();
    };
  }, [def]);

  return (
    <div style={{ position: "relative", overflow: "hidden", background: "#1b1a33", ...style }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}

export default Effect;
