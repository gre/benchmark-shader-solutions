// Effect.native.tsx — @shader-bench/skia on React Native:
// @shopify/react-native-skia <Canvas><Fill><Shader/></Fill></Canvas> with the
// SkSL RuntimeEffect (adapted from apps/rn-skia).
//
// - Animation on the UI thread: a Reanimated useFrameCallback integrates
//   t += dt * speed and computes the 4 phases; `uniforms` is a
//   useDerivedValue that RN Skia binds natively -> redraw on the UI thread,
//   no React re-render and no JS-thread work per frame.
// - resolution = canvas size in POINTS (SkSL fragCoord is in canvas units),
//   measured with onLayout (re-render only on resize).
// - Pixel ratio: RN Skia renders at the screen scale (3x on iPhone 18 Pro)
//   and has no prop to cap it at 2 (see README).
import React, { useEffect, useMemo, useState } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { Canvas, Fill, Shader, Skia, type SkRuntimeEffect } from "@shopify/react-native-skia";
import { useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { getShader, packParams, paramsKey, resolveParams, type ShaderDef } from "./registry";
import "./shaders";
import type { EffectBaseProps } from "./types";

export type { ShaderName } from "./shaders";

export type EffectProps = EffectBaseProps & { style?: StyleProp<ViewStyle> };

const effects = new Map<string, SkRuntimeEffect | null>();

function runtimeEffect(def: ShaderDef): SkRuntimeEffect | null {
  if (!effects.has(def.name)) {
    const e = def.sources.sksl ? Skia.RuntimeEffect.Make(def.sources.sksl) : null;
    if (!e) console.error(`[@shader-bench/skia] ${def.name}: SkSL compile error (see native log)`);
    effects.set(def.name, e);
  }
  return effects.get(def.name)!;
}

const FILL = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 } as const;

export function Effect({ shader, params, style }: EffectProps) {
  const def = getShader(shader);
  const effect = runtimeEffect(def);
  const key = paramsKey(params);
  const { packed, speed } = useMemo(() => {
    const values = resolveParams(def, params);
    return { packed: Array.from(packParams(def, values)), speed: values.speed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, key]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  };

  const periods = def.periods;
  const t = useSharedValue(0);
  const phase = useSharedValue<number[]>([0, 0, 0, 0]);
  const computedT = useSharedValue(-1);
  const speedSV = useSharedValue(speed);
  useEffect(() => {
    speedSV.value = speed;
  }, [speed, speedSV]);

  useFrameCallback(({ timeSincePreviousFrame }) => {
    "worklet";
    if (timeSincePreviousFrame != null) t.value += (timeSincePreviousFrame / 1000) * speedSV.value;
    if (t.value === computedT.value) return; // frozen (speed 0): nothing new to draw
    computedT.value = t.value;
    const f = (P: number) => (((t.value / P) % 1) + 1) % 1;
    phase.value = [f(periods[0]), f(periods[1]), f(periods[2]), f(periods[3])];
  });

  const uniforms = useDerivedValue(() => ({
    resolution: [size.width, size.height],
    phase: phase.value,
    params: packed,
  }));

  return (
    <View style={style} onLayout={onLayout}>
      {effect && size.width > 0 ? (
        <Canvas style={FILL} opaque>
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
    </View>
  );
}

export default Effect;
