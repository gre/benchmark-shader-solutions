/**
 * Codegen spec of the Fabric component <ShaderBenchCompatDynamicView>
 * (package.json `codegenConfig`: library "ShaderBenchCompatDynamicSpec").
 * Native implementations:
 *   iOS     ios/ShaderBenchCompatDynamicView.mm  (Metal, CADisplayLink)
 *   Android android/src/main/java/com/shaderbench/compatdynamic/ (OpenGL ES 2.0)
 *
 * The view is generic: it renders `source` (the shader's code, compiled at
 * runtime: Metal Shading Language on iOS, GLSL ES 1.00 on Android) with the
 * entry points / uniforms of the shader named `shader`, the 4 `periods` and
 * the packed `params` (MAX_PARAMS floats, see src/registry.ts). The clock
 * and the phases are computed natively (t += dt * speed, double precision).
 * `onShaderError` reports a compile / link error (internal: Effect logs it
 * with console.error; not part of the public API).
 *
 * Compatibility: `CodegenTypes` (types) and `codegenNativeComponent` are
 * exported from the 'react-native' root in 0.81 and 0.87, and the codegen
 * TypeScript parser of both reads qualified names (CodegenTypes.Float).
 * No deep `react-native/Libraries/...` import.
 */
import { codegenNativeComponent } from 'react-native';
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';

export type ShaderErrorEvent = Readonly<{
  message: string;
}>;

export interface NativeProps extends ViewProps {
  shader?: string;
  source?: string;
  params?: ReadonlyArray<CodegenTypes.Float>;
  periods?: ReadonlyArray<CodegenTypes.Double>;
  speed?: CodegenTypes.WithDefault<CodegenTypes.Double, 1>;
  onShaderError?: CodegenTypes.DirectEventHandler<ShaderErrorEvent>;
}

export default codegenNativeComponent<NativeProps>(
  'ShaderBenchCompatDynamicView',
) as HostComponent<NativeProps>;
