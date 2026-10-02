// Effect.native.tsx — @shader-bench/gl-react on React Native: gl-react 6 +
// gl-react-expo 6 (expo-gl, OpenGL ES), adapted from apps/rn-gl-react.
//
// - <Surface> (gl-react-expo) fills the view styled by `style`.
// - Uniforms are React props: a JS requestAnimationFrame loop integrates
//   t += dt * speed and re-renders <Node uniforms> every frame (JS thread;
//   gl-react issues the GL calls through expo-gl's JSI). speed 0 stops the
//   loop.
// - resolution = Uniform.Resolution (GL drawing buffer, px).
// - Pixel ratio: expo-gl renders at the screen scale (3x on iPhone 18 Pro)
//   with 4x MSAA; gl-react-expo exposes neither (see README).
import React, { useEffect, useMemo, useState } from "react";
import { LogBox, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { GLSL, Node, Shaders, Uniform } from "gl-react";
import { Surface } from "gl-react-expo";
import { computePhases, getShader, packParams, paramsKey, resolveParams, type ShaderDef } from "./registry";
import "./shaders";
import type { EffectBaseProps } from "./types";

export type { ShaderName } from "./shaders";

export type EffectProps = EffectBaseProps & { style?: StyleProp<ViewStyle> };

// expo-modules-core warns in __DEV__ when process.env.EXPO_OS is not inlined
// by babel-preset-expo (apps that keep RN's own Babel preset); it falls back
// to Platform.OS, so the warning is harmless.
LogBox.ignoreLogs(["The global process.env.EXPO_OS is not defined"]);

const glShaders = new Map<string, ReturnType<typeof Shaders.create>[string]>();
function glShader(def: ShaderDef) {
  if (!glShaders.has(def.name)) {
    glShaders.set(def.name, Shaders.create({ [def.name]: { frag: GLSL`${def.sources.glsl ?? ""}` } })[def.name]);
  }
  return glShaders.get(def.name)!;
}

const vec4s = (a: Float32Array) => [0, 1, 2, 3].map((i) => Array.from(a.subarray(i * 4, i * 4 + 4)));

export function Effect({ shader, params, style }: EffectProps) {
  const def = getShader(shader);
  const key = paramsKey(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const values = useMemo(() => resolveParams(def, params), [def, key]);
  const packed = useMemo(() => vec4s(packParams(def, values)), [def, values]);
  const [t, setT] = useState(0);
  const speed = values.speed;

  useEffect(() => {
    if (speed === 0) return;
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setT((x) => x + dt * speed);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  return (
    <View style={style}>
      <Surface style={StyleSheet.absoluteFill}>
        <Node
          shader={glShader(def)}
          uniforms={{ resolution: Uniform.Resolution, phase: computePhases(def, t), params: packed }}
        />
      </Surface>
    </View>
  );
}

export default Effect;
