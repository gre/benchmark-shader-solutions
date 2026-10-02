// The tech packages offered by the picker. Adding a package = one entry:
// its <Effect> (root entry) + its param schema (subpath '/shaders').
import { Platform } from 'react-native';
import { Effect as NativeEffect } from '@shader-bench/native';
import * as nativeSchema from '@shader-bench/native/shaders';
import { Effect as NativeCompatStaticEffect } from '@shader-bench/native-compatible-static';
import * as nativeCompatStaticSchema from '@shader-bench/native-compatible-static/shaders';
import { Effect as NativeCompatDynamicEffect } from '@shader-bench/native-compatible-dynamic';
import * as nativeCompatDynamicSchema from '@shader-bench/native-compatible-dynamic/shaders';
import { Effect as SkiaEffect } from '@shader-bench/skia';
import * as skiaSchema from '@shader-bench/skia/shaders';
import { Effect as WebgpuEffect } from '@shader-bench/webgpu';
import * as webgpuSchema from '@shader-bench/webgpu/shaders';
import { Effect as GlReactEffect } from '@shader-bench/gl-react';
import * as glReactSchema from '@shader-bench/gl-react/shaders';

const ALL = {
  native: { label: 'native', Effect: NativeEffect, schema: nativeSchema },
  'native-compatible-static': { label: 'native-compatible-static', Effect: NativeCompatStaticEffect, schema: nativeCompatStaticSchema },
  'native-compatible-dynamic': { label: 'native-compatible-dynamic', Effect: NativeCompatDynamicEffect, schema: nativeCompatDynamicSchema },
  skia: { label: 'skia', Effect: SkiaEffect, schema: skiaSchema },
  webgpu: { label: 'webgpu', Effect: WebgpuEffect, schema: webgpuSchema },
  'gl-react': { label: 'gl-react', Effect: GlReactEffect, schema: glReactSchema },
} as const;

// gl-react needs expo-gl (Expo modules), linked on iOS only in this app
// (react-native.config.js): the picker (Object.keys) omits it on Android.
const { 'gl-react': _glReact, ...withoutGlReact } = ALL;
export const TECHS = (Platform.OS === 'ios' ? ALL : withoutGlReact) as typeof ALL;

export type TechName = keyof typeof ALL;
