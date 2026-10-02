/**
 * Effect.tsx — rn-native: the effect is the app-local Fabric component
 * <SilkView> (codegen spec src/specs/SilkViewNativeComponent.ts).
 * iOS: Metal (silk.metal, CADisplayLink). Android: AGSL RuntimeShader
 * (res/raw/silk.agsl, Choreographer on a render thread).
 *
 * Contract (see rn-baseline): fills the screen, pixel ratio capped at 2 and
 * resize handled natively, onFirstFrame() called once. Unlike the other
 * techs, the clock and the 4 phases are computed NATIVELY in double
 * precision (same PERIODS / fract(t/P) as src/time.ts) — zero JS per frame.
 * FROZEN_TIME (src/config.ts) is passed as the `frozenTime` prop
 * (-1 = live, codegen has no nullable Double).
 *
 * onFirstFrame timing: the native event fires once the first frame has been
 * presented (iOS: MTLDrawable presented handler; Android: after the first
 * unlockCanvasAndPost); the shell then measures "ms after JS start" on JS
 * receipt, as every other app. The native-side delay (view creation ->
 * first frame) is logged separately.
 *
 * Stress mode (src/stress.ts): with `countFrames` (first instance, stats=1)
 * effect_fps/p95 = the native onFrameStats of that view (fps and p95 of the
 * CADisplayLink render callbacks that encoded + presented a frame, ~1 s
 * window, emitted ~1/s).
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, type NativeSyntheticEvent } from 'react-native';
import SilkView, {
  type FirstFrameEvent,
  type FrameStatsEvent,
} from './specs/SilkViewNativeComponent';
import { FROZEN_TIME } from './config';
import { publishNativeStats } from './nativeStats';
import { effectStatsNative } from './stress';

export const TECH = 'native Fabric component (Metal / AGSL)';
export const ANIMATION_THREAD =
  'native (iOS CADisplayLink main thread / Android Choreographer render thread), zero JS per frame';

export type EffectProps = { onFirstFrame?: () => void; countFrames?: boolean };

export default function Effect({ onFirstFrame, countFrames = false }: EffectProps) {
  const cb = useRef(onFirstFrame);
  useEffect(() => {
    cb.current = onFirstFrame;
  }, [onFirstFrame]);

  const handleFirstFrame = useCallback(
    (e: NativeSyntheticEvent<FirstFrameEvent>) => {
      console.log(
        `[effect] native first frame ${e.nativeEvent.ms.toFixed(0)} ms after view creation`,
      );
      cb.current?.();
    },
    [],
  );
  const handleStats = useCallback(
    (e: NativeSyntheticEvent<FrameStatsEvent>) => {
      // Only the primary instance (the one given onFirstFrame by App) feeds
      // the overlay, so stress copies (instances > 1) don't overwrite it.
      if (cb.current) publishNativeStats(e.nativeEvent);
      if (countFrames) {
        effectStatsNative(e.nativeEvent.fps, e.nativeEvent.p95Ms);
      }
    },
    [countFrames],
  );

  return (
    <SilkView
      style={StyleSheet.absoluteFill}
      frozenTime={FROZEN_TIME ?? -1}
      paused={false}
      speed={1}
      onFirstFrame={handleFirstFrame}
      onFrameStats={handleStats}
    />
  );
}
