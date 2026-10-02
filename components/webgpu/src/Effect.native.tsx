// Effect.native.tsx — @shader-bench/webgpu on React Native:
// react-native-webgpu 0.5.17 (Dawn), adapted from apps/rn-webgpu.
//
// - Setup on the JS thread (adapter, device, context.configure, shader module
//   + getCompilationInfo, pipeline, 96-byte uniform buffer, bind group).
//   Errors go to console.error; the box stays #1b1a33.
// - Per-frame rendering on the UI thread: the GPU objects are handed to a
//   worklet with runOnUI (react-native-webgpu registers them as worklet
//   serializables), which loops with the UI runtime's requestAnimationFrame,
//   integrates t += dt * speed, writes the uniforms, encodes, submits and
//   presents. No JS-thread work and no React re-render per frame. Params and
//   speed reach the loop through Reanimated mutables; speed 0 freezes and
//   stops presenting until a param or the size changes.
// - Drawing buffer = layout size (points) * min(PixelRatio, 2), re-checked
//   every frame.
import React, { useEffect, useRef } from "react";
import { PixelRatio, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Canvas, installWebGPU } from "react-native-webgpu";
import type { CanvasRef, RNCanvasContext } from "react-native-webgpu";
import { makeMutable } from "react-native-reanimated";
import { runOnUI } from "react-native-worklets";
import { getShader, packParams, paramsKey, resolveParams, MAX_PARAMS, UNIFORM_BYTES, UNIFORM_FLOATS } from "./registry";
import "./shaders";
import type { EffectBaseProps } from "./types";

export type { ShaderName } from "./shaders";

export type EffectProps = EffectBaseProps & { style?: StyleProp<ViewStyle> };

const MAX_PIXEL_RATIO = 2;
const TAG = "[@shader-bench/webgpu]";

type Mutable<T> = { value: T };

type Loop = {
  device: GPUDevice;
  context: RNCanvasContext;
  pipeline: GPURenderPipeline;
  ubo: GPUBuffer;
  bindGroup: GPUBindGroup;
  dpr: number;
  maxDim: number;
  periods: number[];
};

type Shared = {
  running: Mutable<boolean>;
  speed: Mutable<number>;
  params: Mutable<number[]>;
  dirty: Mutable<boolean>;
};

// The global GPU* types come from whichever @webgpu/types the app resolves
// (e.g. 0.1.21, hoisted from canvaskit-wasm, names it compilationInfo()):
// call the standard getCompilationInfo() without depending on that version.
type CompilationMessage = { type: string; lineNum: number; linePos: number; message: string };
function compilationInfo(m: GPUShaderModule): Promise<{ messages: readonly CompilationMessage[] }> {
  return (m as unknown as { getCompilationInfo(): Promise<{ messages: readonly CompilationMessage[] }> }).getCompilationInfo();
}

// Runs on the UI runtime until `running` becomes false.
function renderLoop(loop: Loop, s: Shared) {
  "worklet";
  installWebGPU(); // GPUBufferUsage & co. are not defined on worklet runtimes
  const { device, context, pipeline, ubo, bindGroup, dpr, maxDim, periods } = loop;
  const canvas = context.canvas as unknown as { width: number; height: number; clientWidth: number; clientHeight: number };
  const data = new Float32Array(UNIFORM_FLOATS);
  let t = 0;
  let last = -1;
  const frame = (now: number) => {
    if (!s.running.value) return;
    if (last >= 0) t += ((now - last) / 1000) * s.speed.value;
    last = now;
    const w = Math.min(maxDim, Math.max(1, Math.round(canvas.clientWidth * dpr)));
    const h = Math.min(maxDim, Math.max(1, Math.round(canvas.clientHeight * dpr)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      s.dirty.value = true;
    }
    if (s.speed.value !== 0 || s.dirty.value) {
      s.dirty.value = false;
      // = packUniforms() (registry.ts), inlined: the registry is not a worklet
      data[0] = w;
      data[1] = h;
      for (let i = 0; i < 4; i++) data[4 + i] = (((t / periods[i]) % 1) + 1) % 1;
      const p = s.params.value;
      for (let i = 0; i < 16; i++) data[8 + i] = i < p.length ? p[i] : 0;
      device.queue.writeBuffer(ubo, 0, data);
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view: context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      device.queue.submit([enc.finish()]);
      context.present();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function Effect({ shader, params, style }: EffectProps) {
  const def = getShader(shader);
  const ref = useRef<CanvasRef>(null);
  const key = paramsKey(params);
  const values = resolveParams(def, params);
  const packed = Array.from(packParams(def, values)).slice(0, MAX_PARAMS);
  const shared = useRef<Shared | null>(null);
  if (!shared.current) {
    shared.current = {
      running: makeMutable(true),
      speed: makeMutable(values.speed),
      params: makeMutable(packed),
      dirty: makeMutable(true),
    };
  }

  // params / speed -> UI-thread loop
  useEffect(() => {
    const s = shared.current!;
    s.speed.value = values.speed;
    s.params.value = packed;
    s.dirty.value = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const code = def.sources.wgsl;
    const s = shared.current!;
    s.running.value = true;
    let disposed = false;
    let device: GPUDevice | null = null;
    const fail = (msg: string) => console.error(TAG, `${def.name}:`, msg);

    async function init() {
      if (!code) return fail("no WGSL source");
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return fail("no WebGPU adapter");
      const dev = await adapter.requestDevice();
      if (disposed) return dev.destroy();
      device = dev;
      // getContext needs a laid-out view: retry on the next frames if size is 0.
      let context: RNCanvasContext | null = null;
      for (let i = 0; i < 60 && !disposed; i++) {
        try {
          context = ref.current?.getContext("webgpu") ?? null;
        } catch {
          context = null;
        }
        const c = context?.canvas as unknown as { clientWidth: number } | undefined;
        if (context && c && c.clientWidth > 0) break;
        await new Promise((r) => requestAnimationFrame(r));
      }
      if (disposed) return;
      if (!context) return fail("canvas.getContext('webgpu') returned null");
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device: dev, format, alphaMode: "opaque" });

      dev.pushErrorScope("validation");
      const module = dev.createShaderModule({ label: `${def.name}.wgsl`, code });
      const info = await compilationInfo(module);
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
      s.dirty.value = true;
      const loop: Loop = {
        device: dev,
        context,
        pipeline,
        ubo,
        bindGroup,
        dpr: Math.min(PixelRatio.get(), MAX_PIXEL_RATIO),
        maxDim: dev.limits.maxTextureDimension2D,
        periods: [...def.periods],
      };
      runOnUI(renderLoop)(loop, s);
    }

    init().catch((e) => fail(String(e?.message ?? e)));
    return () => {
      disposed = true;
      s.running.value = false;
      // Let the UI loop observe `running` before the device goes away.
      const d = device;
      setTimeout(() => d?.destroy(), 100);
    };
  }, [def]);

  return (
    <View style={[styles.bg, style]}>
      <Canvas ref={ref} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({ bg: { backgroundColor: "#1b1a33" } });

export default Effect;
