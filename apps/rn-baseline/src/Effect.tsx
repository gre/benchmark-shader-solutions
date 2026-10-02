/**
 * Effect.tsx — THE ONLY FILE A TECH APP REPLACES (+ src/shaders/silk.<lang>.ts).
 *
 * Contract every tech Effect must follow:
 *  - default export: a component `Effect({ onFirstFrame })` that fills the
 *    whole screen (StyleSheet.absoluteFill), no safe-area insets.
 *  - pixel-ratio aware: the render target is layout size (points) *
 *    min(PixelRatio.get(), MAX_PIXEL_RATIO) (= 2, src/config.ts), where the
 *    lib lets you choose; the shader `resolution` uniform is in the units of
 *    its fragment coordinate (GL/WebGPU: pixels, Skia: points).
 *  - handles rotation/resize: size comes from useWindowDimensions() or
 *    onLayout, and the surface + `resolution` follow it.
 *  - reads the 4 animation phases EVERY FRAME from src/time.ts
 *    (currentPhases() on the JS thread, phasesUI() in a worklet) and passes
 *    them as the `phase` uniform (vec4). FROZEN_TIME is honored there.
 *  - calls `onFirstFrame()` once, when the first frame has been drawn
 *    (or as close as the lib lets us know), for time-to-first-frame.
 *  - exports ANIMATION_THREAD: a short string stating which thread drives
 *    the animation (shown in the FPS overlay), and TECH: the lib name.
 *  - stress mode (src/stress.ts): when `countFrames` is true (first instance,
 *    stats=1), signal every frame the effect draws with effectFrameUI(ms)
 *    (worklet) / effectFrameJS() (JS thread). False/absent: no extra work.
 *
 * Baseline: no graphics lib. A solid #1b1a33 View, still driven by a
 * per-frame loop (Reanimated useFrameCallback on the UI thread computing the
 * phases into a SharedValue) so the baseline pays the same loop cost
 * structure as a UI-thread-driven tech.
 * Stress effect_fps counts these frame-callback ticks (nothing is drawn).
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { phasesUI, type Phases } from './time';
import { effectFrameUI } from './stress';

export const TECH = 'baseline (no graphics lib)';
export const ANIMATION_THREAD =
  'UI thread (Reanimated useFrameCallback), phases only, solid color';

export type EffectProps = { onFirstFrame?: () => void; countFrames?: boolean };

export default function Effect({ onFirstFrame, countFrames = false }: EffectProps) {
  const phases = useSharedValue<Phases>([0, 0, 0, 0]);
  const reported = useSharedValue(false);
  const cb = useRef(onFirstFrame);
  useEffect(() => {
    cb.current = onFirstFrame;
  }, [onFirstFrame]);
  const fireFirstFrame = () => cb.current?.();

  useFrameCallback(({ timestamp, timeSinceFirstFrame }) => {
    phases.value = phasesUI(timeSinceFirstFrame);
    if (countFrames) {
      effectFrameUI(timestamp);
    }
    if (!reported.value) {
      reported.value = true;
      scheduleOnRN(fireFirstFrame);
    }
  });

  return <View style={[StyleSheet.absoluteFill, styles.bg]} />;
}

const styles = StyleSheet.create({
  bg: { backgroundColor: '#1b1a33' },
});
