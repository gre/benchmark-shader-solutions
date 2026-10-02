/**
 * Effect.tsx — rn-native-compatible-dynamic: the effect is the app-local
 * Fabric component <SilkView> (codegen spec src/specs/SilkViewNativeComponent.ts),
 * identical to rn-native-compatible-static except that the shader SOURCE
 * comes from JS (`source` prop) and is compiled at runtime:
 * iOS: Metal Shading Language (src/shaders/silk.ios.ts) compiled with
 * newLibraryWithSource (async), CADisplayLink. Android: OpenGL ES 2.0 with the
 * GLSL ES 1.00 source (src/shaders/silk.android.ts), own EGL context on a
 * render thread with Choreographer, Android 7.1+ (minSdk 25). Each bundle
 * carries only its platform's language.
 *
 * Contract (see rn-baseline): fills the screen, pixel ratio capped at 2 and
 * resize handled natively, onFirstFrame() called once. The clock and the 4
 * phases are computed NATIVELY in double precision (same PERIODS /
 * fract(t/P) as src/time.ts) — zero JS per frame. FROZEN_TIME
 * (src/config.ts) is passed as the `frozenTime` prop (-1 = live).
 *
 * onFirstFrame timing: the native event fires once the first frame has been
 * presented (iOS: first command buffer completed; Android: after the first
 * eglSwapBuffers), i.e. after the runtime shader compile; the shell then
 * measures "ms after JS start" on JS receipt. The native side also logs
 * "[effect] shader setup N ms" (compile + pipeline / link).
 *
 * Stress mode (src/stress.ts): with `countFrames` (first instance, stats=1)
 * effect_fps/p95 = the native onFrameStats of that view.
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
import SILK_SOURCE from './shaders/silk';

export const TECH = 'native Fabric component (Metal / OpenGL ES 2.0), shader source from JS';
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
      source={SILK_SOURCE}
      frozenTime={FROZEN_TIME ?? -1}
      paused={false}
      speed={1}
      onFirstFrame={handleFirstFrame}
      onFrameStats={handleStats}
    />
  );
}
