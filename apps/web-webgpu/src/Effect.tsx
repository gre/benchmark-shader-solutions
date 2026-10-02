/// <reference types="@webgpu/types" />
import { useEffect, useRef, useState } from "react";
import { getPhases } from "./time";
import SILK_WGSL from "./shaders/silk.wgsl";

/**
 * WebGPU Effect (raw WebGPU API, no wrapper lib) — see the contract in web-baseline.
 *
 * - silk.wgsl: fullscreen triangle (vs_main, draw 3, no vertex buffer) + fs_main;
 *   one 32-byte uniform buffer [w, h, 0, 0, p0, p1, p2, p3] at group 0 binding 0.
 * - Canvas backing = css size * min(devicePixelRatio, 2), checked every frame
 *   (covers window resize and DPR changes; the swap chain follows the canvas size).
 * - Failures never crash the app: "WebGPU unavailable", WGSL compile errors
 *   (getCompilationInfo), pipeline validation errors and device loss are shown
 *   as a message over the background. Device loss triggers a re-init (max 3 tries).
 * - onFirstFrame() fires after the first submitted frame (adapter/device init included).
 */
export default function Effect({ onFirstFrame, onFrame }: { onFirstFrame: () => void; onFrame: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const code = SILK_WGSL;
    let disposed = false;
    let raf = 0;
    let device: GPUDevice | null = null;
    let first = true;
    let restarts = 0;

    const fail = (msg: string) => {
      console.error("[web-webgpu]", msg);
      if (!disposed) setError(msg);
    };

    async function init() {
      if (!navigator.gpu) return fail("WebGPU is unavailable in this browser (navigator.gpu is undefined).");
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return fail("WebGPU is unavailable: no GPU adapter found.");
      const dev = await adapter.requestDevice();
      if (disposed) return dev.destroy();
      device = dev;
      setError(null);

      dev.lost.then((info) => {
        if (disposed || info.reason === "destroyed") return;
        cancelAnimationFrame(raf);
        if (restarts++ < 3) {
          console.warn("[web-webgpu] device lost, re-initialising:", info.message);
          init().catch((e) => fail(String(e?.message ?? e)));
        } else fail(`WebGPU device lost: ${info.message}`);
      });
      dev.addEventListener("uncapturederror", (e) => fail(`WebGPU error: ${e.error.message}`));

      const ctx = canvas.getContext("webgpu");
      if (!ctx) return fail("WebGPU is unavailable: canvas.getContext('webgpu') returned null.");
      const format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device: dev, format, alphaMode: "opaque" });

      dev.pushErrorScope("validation"); // keeps the shader error out of "uncapturederror"
      const module = dev.createShaderModule({ label: "silk.wgsl", code });
      const info = await module.getCompilationInfo();
      await dev.popErrorScope();
      const errors = info.messages.filter((m) => m.type === "error");
      if (errors.length) {
        return fail("WGSL compilation failed:\n" + errors.map((m) => `silk.wgsl:${m.lineNum}:${m.linePos} ${m.message}`).join("\n"));
      }

      dev.pushErrorScope("validation");
      const pipeline = dev.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vs_main" },
        fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });
      const ubo = dev.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const bindGroup = dev.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: ubo } }],
      });
      const pipeErr = await dev.popErrorScope();
      if (pipeErr) return fail(`WebGPU pipeline error: ${pipeErr.message}`);
      if (disposed) return;

      const data = new Float32Array(8);
      const maxDim = dev.limits.maxTextureDimension2D;
      const frame = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.min(maxDim, Math.max(1, Math.round(canvas.clientWidth * dpr)));
        const h = Math.min(maxDim, Math.max(1, Math.round(canvas.clientHeight * dpr)));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const p = getPhases();
        data[0] = w;
        data[1] = h;
        data[4] = p[0];
        data[5] = p[1];
        data[6] = p[2];
        data[7] = p[3];
        dev.queue.writeBuffer(ubo, 0, data);
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
        if (first) {
          first = false;
          onFirstFrame();
        }
        onFrame();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }

    init().catch((e) => fail(String(e?.message ?? e)));
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      device?.destroy();
    };
    // SILK_WGSL in deps: Vite HMR of silk.wgsl.ts re-renders this component with the new
    // module value, and the changed dep rebuilds the device/pipeline (Fast Refresh alone
    // does not re-run effects whose deps are unchanged).
  }, [onFirstFrame, onFrame, SILK_WGSL]);

  return (
    <>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", display: "block", background: "#1b1a33" }} />
      {error && (
        <pre
          style={{
            position: "fixed", left: 16, right: 16, bottom: 16, margin: 0, padding: "10px 14px", zIndex: 5,
            font: "13px/1.5 ui-monospace, Menlo, monospace", color: "#fdd", whiteSpace: "pre-wrap",
            background: "rgba(80,0,0,0.75)", borderRadius: 6,
          }}
        >
          {error}
        </pre>
      )}
    </>
  );
}
