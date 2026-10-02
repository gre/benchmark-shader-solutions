// Effect.native.tsx — @shader-bench/native-compatible-dynamic on React Native:
// the Fabric component <ShaderBenchCompatDynamicView> (Metal on iOS, OpenGL
// ES 2.0 on Android 7.1+). JS resolves/packs the params and passes them as
// props together with the shader SOURCE of this platform (Metal on iOS, GLSL
// on Android: each bundle only has its own, see shaders/<name>/sources.*.ts),
// which the view compiles at runtime. Editing a shader is a JS change (Fast
// Refresh, OTA). The clock, phases and frame loop are native (zero JS per
// frame). Pixel ratio capped at 2 natively.
//
// Compile errors come back through the internal `onShaderError` event and
// are logged with console.error (red box in dev); the view then draws a
// solid #1b1a33.
import React, { useCallback, useMemo } from "react";
import type { NativeSyntheticEvent, StyleProp, ViewStyle } from "react-native";
import { getShader, packParams, paramsKey, resolveParams } from "./registry";
import "./shaders";
import NativeView, { type ShaderErrorEvent } from "./specs/ShaderBenchCompatDynamicViewNativeComponent";
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
  const name = def.name;
  const onShaderError = useCallback(
    (e: NativeSyntheticEvent<ShaderErrorEvent>) =>
      console.error(`[@shader-bench/native-compatible-dynamic] shader "${name}": ${e.nativeEvent.message}`),
    [name],
  );
  return (
    <NativeView
      style={style}
      shader={name}
      source={def.sources.metal ?? def.sources.glsl ?? ""}
      periods={def.periods}
      params={packed}
      speed={speed}
      onShaderError={onShaderError}
    />
  );
}

export default Effect;
