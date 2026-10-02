/// <reference types="@webgpu/types" />
/**
 * Effect.tsx — react-native-wgpu 0.5.17 implementation (WebGPU / Dawn). Imports
 * come from 'react-native-webgpu' (same version): react-native-wgpu 0.5.17 is a
 * deprecated re-export shim of it, without TypeScript types (see README).
 * Contract: see rn-baseline's src/Effect.tsx (default export Effect({onFirstFrame}),
 * TECH, ANIMATION_THREAD).
 *
 * - silk.wgsl: fullscreen triangle (vs_main, draw 3, no vertex buffer) + fs_main;
 *   one 32-byte uniform buffer [w, h, 0, 0, p0, p1, p2, p3] at group 0 binding 0.
 * - Setup on the JS thread (adapter, device, context.configure, shader module +
 *   getCompilationInfo, pipeline, buffer, bind group). WGSL compile errors and
 *   pipeline validation errors are shown as a red box over the background.
 * - Per-frame rendering runs on the **UI thread**: the GPUDevice / context /
 *   pipeline are handed to a worklet with runOnUI (react-native-webgpu registers
 *   its objects as custom serializables for react-native-worklets), which loops
 *   with the UI runtime's requestAnimationFrame, computes the phases there
 *   (phasesUI, FROZEN_TIME honored), writes the uniforms, encodes, submits and
 *   calls context.present(). No React re-render and no JS-thread work per frame.
 * - Drawing buffer = layout size (canvas.clientWidth/Height, points) *
 *   min(PixelRatio.get(), MAX_PIXEL_RATIO), re-checked every frame (rotation).
 * - onFirstFrame() is called (scheduleOnRN) after the first present().
 * - Stress mode (src/stress.ts): with `countFrames` (first instance, stats=1)
 *   every context.present() of the worklet loop is counted by effectFrameUI().
 * - Fast Refresh: SILK_WGSL is an effect dependency, so editing
 *   src/shaders/silk.wgsl.ts tears the loop down and rebuilds device + pipeline.
 */
import React, { useEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, Text, View } from 'react-native';
import { Canvas, installWebGPU } from 'react-native-webgpu';
import type { CanvasRef, RNCanvasContext } from 'react-native-webgpu';
import { makeMutable } from 'react-native-reanimated';
import { runOnUI, scheduleOnRN } from 'react-native-worklets';
import { MAX_PIXEL_RATIO } from './config';
import { phasesUI } from './time';
import SILK_WGSL from './shaders/silk.wgsl';
import { effectFrameUI } from './stress';

export const TECH = 'react-native-wgpu / react-native-webgpu 0.5.17 (Dawn)';
export const ANIMATION_THREAD =
  'UI thread (runOnUI worklet + UI requestAnimationFrame, context.present())';

export type EffectProps = { onFirstFrame?: () => void; countFrames?: boolean };

type Loop = {
  device: GPUDevice;
  context: RNCanvasContext;
  pipeline: GPURenderPipeline;
  ubo: GPUBuffer;
  bindGroup: GPUBindGroup;
  dpr: number;
  maxDim: number;
};

// Runs on the UI runtime until `running.value` becomes false.
function renderLoop(
  loop: Loop,
  running: { value: boolean },
  firstFrame: () => void,
  countFrames: boolean,
) {
  'worklet';
  installWebGPU(); // GPUBufferUsage & co. are not defined on worklet runtimes
  const { device, context, pipeline, ubo, bindGroup, dpr, maxDim } = loop;
  const canvas = context.canvas as unknown as {
    width: number;
    height: number;
    clientWidth: number;
    clientHeight: number;
  };
  const data = new Float32Array(8);
  let t0 = -1;
  let first = true;
  const frame = (now: number) => {
    if (!running.value) {
      return;
    }
    if (t0 < 0) {
      t0 = now;
    }
    const w = Math.min(maxDim, Math.max(1, Math.round(canvas.clientWidth * dpr)));
    const h = Math.min(maxDim, Math.max(1, Math.round(canvas.clientHeight * dpr)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const p = phasesUI(now - t0);
    data[0] = w;
    data[1] = h;
    data[4] = p[0];
    data[5] = p[1];
    data[6] = p[2];
    data[7] = p[3];
    device.queue.writeBuffer(ubo, 0, data);
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 1],
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([enc.finish()]);
    context.present();
    if (countFrames) {
      effectFrameUI(now);
    }
    if (first) {
      first = false;
      scheduleOnRN(firstFrame);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export default function Effect({ onFirstFrame, countFrames = false }: EffectProps) {
  const ref = useRef<CanvasRef>(null);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(onFirstFrame);
  useEffect(() => {
    cb.current = onFirstFrame;
  }, [onFirstFrame]);

  useEffect(() => {
    const code = SILK_WGSL;
    const running = makeMutable(true);
    let disposed = false;
    let device: GPUDevice | null = null;
    const fail = (msg: string) => {
      console.error('[rn-webgpu]', msg);
      if (!disposed) {
        setError(msg);
      }
    };
    const fireFirstFrame = () => cb.current?.();

    async function init() {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        return fail('WebGPU: no GPU adapter found.');
      }
      const dev = await adapter.requestDevice();
      if (disposed) {
        return dev.destroy();
      }
      device = dev;
      setError(null);

      // getContext needs a laid-out view: retry on the next frame if size is 0.
      let context: RNCanvasContext | null = null;
      for (let i = 0; i < 60 && !disposed; i++) {
        try {
          context = ref.current?.getContext('webgpu') ?? null;
        } catch {
          context = null;
        }
        const c = context?.canvas as unknown as { clientWidth: number } | undefined;
        if (context && c && c.clientWidth > 0) {
          break;
        }
        await new Promise(r => requestAnimationFrame(r));
      }
      if (!context) {
        return fail("WebGPU: canvas.getContext('webgpu') returned null.");
      }
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device: dev, format, alphaMode: 'opaque' });

      dev.pushErrorScope('validation');
      const module = dev.createShaderModule({ label: 'silk.wgsl', code });
      const info = await module.getCompilationInfo();
      await dev.popErrorScope();
      const errors = info.messages.filter(m => m.type === 'error');
      if (errors.length) {
        return fail(
          'WGSL compilation failed:\n' +
            errors
              .map(m => `silk.wgsl:${m.lineNum}:${m.linePos} ${m.message}`)
              .join('\n'),
        );
      }

      dev.pushErrorScope('validation');
      const pipeline = dev.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs_main' },
        fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });
      const ubo = dev.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bindGroup = dev.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: ubo } }],
      });
      const pipeErr = await dev.popErrorScope();
      if (pipeErr) {
        return fail(`WebGPU pipeline error: ${pipeErr.message}`);
      }
      if (disposed) {
        return;
      }
      const loop: Loop = {
        device: dev,
        context,
        pipeline,
        ubo,
        bindGroup,
        dpr: Math.min(PixelRatio.get(), MAX_PIXEL_RATIO),
        maxDim: dev.limits.maxTextureDimension2D,
      };
      runOnUI(renderLoop)(loop, running, fireFirstFrame, countFrames);
    }

    init().catch(e => fail(String(e?.message ?? e)));
    return () => {
      disposed = true;
      running.value = false;
      // Let the UI loop observe `running` before the device goes away.
      const d = device;
      setTimeout(() => d?.destroy(), 100);
    };
    // SILK_WGSL in deps: Fast Refresh of silk.wgsl.ts re-renders this component
    // with the new module value and the effect rebuilds device + pipeline.
  }, [SILK_WGSL, countFrames]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.bg]}>
      <Canvas ref={ref} style={StyleSheet.absoluteFill} />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { backgroundColor: '#1b1a33' },
  error: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: '45%',
    padding: 10,
    borderRadius: 6,
    color: '#fdd',
    fontFamily: 'Menlo',
    fontSize: 12,
    backgroundColor: 'rgba(80,0,0,0.85)',
  },
});
