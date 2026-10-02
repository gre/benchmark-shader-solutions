/**
 * Effect.tsx — rn-skia: @shopify/react-native-skia + SkSL RuntimeEffect.
 * (Contract: see the header of this file in rn-baseline.)
 *
 *  - Shader: src/shaders/silk.sksl.ts (verbatim copy of shaders/silk.sksl),
 *    compiled once with Skia.RuntimeEffect.Make (null -> compile error).
 *  - Drawing: <Canvas><Fill><Shader source uniforms/></Fill></Canvas>.
 *  - Animation: Reanimated useFrameCallback computes the 4 phases on the UI
 *    thread into a SharedValue; `uniforms` is a useDerivedValue, which RN
 *    Skia binds natively -> redraw on the UI thread, no React re-render and
 *    no JS-thread work per frame. FROZEN_TIME is honored by phasesUI().
 *  - Size: `resolution` = window size in points (SkSL fragCoord is in canvas
 *    units = points). The canvas is absoluteFill, so window = canvas size;
 *    useWindowDimensions re-renders on rotation.
 *  - Pixel ratio: RN Skia renders at UIScreen.scale (3x on iPhone 18 Pro);
 *    there is no prop to cap it at MAX_PIXEL_RATIO (see README).
 *  - onFirstFrame: fired from the 2nd UI-thread frame callback after mount
 *    (the 1st one sets the uniforms, Skia draws the picture in that frame);
 *    accuracy ~1 frame (16 ms). RN Skia has no "did draw" callback.
 *  - Stress mode (src/stress.ts): with `countFrames` (first instance,
 *    stats=1) effectFrameUI() counts the UI-thread frame-callback ticks that
 *    write new phases; each one makes Skia's mapper call
 *    SkiaViewApi.applyUpdates -> native redraw request. Closest signal
 *    available: not a confirmed draw/present (native may coalesce).
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { phasesUI, type Phases } from './time';
import silk from './shaders/silk.sksl';
import { effectFrameUI } from './stress';

export const TECH = '@shopify/react-native-skia 2.14.0 (SkSL)';
export const ANIMATION_THREAD =
  'UI thread (Reanimated useFrameCallback -> useDerivedValue uniforms, Skia draws on UI thread)';

const effect = Skia.RuntimeEffect.Make(silk);
if (!effect) {
  throw new Error('silk.sksl failed to compile (see native log)');
}

export type EffectProps = { onFirstFrame?: () => void; countFrames?: boolean };

export default function Effect({ onFirstFrame, countFrames = false }: EffectProps) {
  const { width, height } = useWindowDimensions();
  const phases = useSharedValue<Phases>([0, 0, 0, 0]);
  const frames = useSharedValue(0);
  const cb = useRef(onFirstFrame);
  useEffect(() => {
    cb.current = onFirstFrame;
  }, [onFirstFrame]);
  const fireFirstFrame = () => cb.current?.();

  useFrameCallback(({ timestamp, timeSinceFirstFrame }) => {
    // Live: new phases every frame. Frozen: still re-assigned every frame
    // (same per-frame cost as live), values constant.
    phases.value = phasesUI(timeSinceFirstFrame);
    if (countFrames) {
      effectFrameUI(timestamp);
    }
    if (frames.value < 2) {
      frames.value += 1;
      if (frames.value === 2) {
        scheduleOnRN(fireFirstFrame);
      }
    }
  });

  const uniforms = useDerivedValue(() => ({
    resolution: [width, height],
    phase: phases.value,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFill} opaque>
      <Fill>
        <Shader source={effect!} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
