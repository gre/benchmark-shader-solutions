/**
 * Effect.tsx — gl-react (gl-react-expo / expo-gl) implementation of the
 * shell contract (see rn-baseline's Effect.tsx header for the contract).
 *
 * Animation model: a JS-thread requestAnimationFrame loop calls
 * setState(currentPhases()) every frame -> React re-renders <Node uniforms>
 * -> gl-react marks the Surface dirty and its own rAF loop (also JS thread)
 * issues the GL calls through expo-gl's JSI WebGL binding; gl-react-expo
 * ends the frame with gl.endFrameEXP(), and expo-gl's native GLView presents
 * it on its CADisplayLink (UI thread). So: JS thread + a React re-render per
 * frame. In gl-react, uniforms are props: this is the idiomatic path (the
 * same as web-gl-react). (Node#setDrawProps would skip React reconciliation
 * but is an undocumented internal.)
 *
 * Resolution: `Uniform.Resolution` = the Node framebuffer size = the GL
 * drawing buffer, in physical pixels (gl_FragCoord units).
 *
 * Pixel ratio: NOT cappable. expo-gl's iOS GLView hard-codes
 * contentScaleFactor = UIScreen scale (3 on iPhone 18 Pro) and
 * gl-react-expo's <Surface> has no pixelRatio prop (only gl-react-dom has
 * one), so MAX_PIXEL_RATIO (2) cannot be honored: the effect renders at 3x.
 * Also, expo-gl's GLView defaults to msaaSamples = 4 and gl-react-expo does
 * not forward that prop, so a 4x MSAA renderbuffer is always resolved.
 *
 * GLSL compile errors: gl-shader throws a GLError (formatted compiler log);
 * gl-react's Surface catches it in _draw, console.warn()s it and rethrows
 * from the rAF callback -> red box in Debug (Release: uncaught JS error).
 *
 * Stress mode (src/stress.ts): with `countFrames` (first instance, stats=1)
 * every Node onDraw (GL commands of one frame issued from JS) is counted by
 * effectFrameJS().
 */
import React, { useEffect, useRef, useState } from 'react';
import { LogBox, StyleSheet } from 'react-native';
import { GLSL, Node, Shaders, Uniform } from 'gl-react';
import { Surface } from 'gl-react-expo';
import { currentPhases, type Phases } from './time';
import silk from './shaders/silk.glsl';
import { effectFrameJS } from './stress';

// expo-modules-core warns in __DEV__ when process.env.EXPO_OS is not inlined
// by babel-preset-expo. We deliberately keep RN's own babel preset (shared
// stack); expo-modules-core falls back to RN's Platform.OS, so it is harmless.
LogBox.ignoreLogs(['The global process.env.EXPO_OS is not defined']);

export const TECH = 'gl-react 6 + gl-react-expo (expo-gl 57)';
export const ANIMATION_THREAD =
  'JS thread (rAF -> setState -> React re-render -> gl-react draw via expo-gl JSI)';

const shaders = Shaders.create({ silk: { frag: GLSL`${silk}` } });

export type EffectProps = { onFirstFrame?: () => void; countFrames?: boolean };

export default function Effect({ onFirstFrame, countFrames = false }: EffectProps) {
  const [phases, setPhases] = useState<Phases>(() => currentPhases());
  const cb = useRef(onFirstFrame);
  useEffect(() => {
    cb.current = onFirstFrame;
  }, [onFirstFrame]);
  const first = useRef(true);

  useEffect(() => {
    let raf = requestAnimationFrame(function loop() {
      setPhases(currentPhases());
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const onDraw = () => {
    if (countFrames) {
      effectFrameJS();
    }
    if (first.current) {
      first.current = false;
      cb.current?.();
    }
  };

  return (
    <Surface style={StyleSheet.absoluteFill}>
      <Node
        shader={shaders.silk}
        uniforms={{ resolution: Uniform.Resolution, phase: phases }}
        onDraw={onDraw}
      />
    </Surface>
  );
}
