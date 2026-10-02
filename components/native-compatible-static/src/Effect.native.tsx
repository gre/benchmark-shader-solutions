// Effect.native.tsx — @shader-bench/native-compatible-static on React Native:
// the Fabric component <ShaderBenchCompatStaticView> (Metal on iOS, OpenGL ES
// 2.0 on Android 7.1+). JS only resolves/packs the params and passes them as
// props with the shader NAME: the shader itself ships natively (metallib /
// Android asset). The clock, phases and frame loop are native (zero JS per
// frame). Pixel ratio capped at 2 natively.
import React, { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { getShader, packParams, paramsKey, resolveParams } from "./registry";
import "./shaders";
import NativeView from "./specs/ShaderBenchCompatStaticViewNativeComponent";
import type { EffectBaseProps } from "./types";

export type { ShaderName } from "./shaders";

export type EffectProps = EffectBaseProps & { style?: StyleProp<ViewStyle> };

export function Effect({ shader, params, style }: EffectProps) {
  const def = getShader(shader);
  const key = paramsKey(params);
  const { packed, speed } = useMemo(() => {
    const values = resolveParams(def, params);
    return { packed: Array.from(packParams(def, values)), speed: values.speed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, key]);
  return (
    <NativeView
      style={style}
      shader={def.name}
      periods={def.periods}
      params={packed}
      speed={speed}
    />
  );
}

export default Effect;
