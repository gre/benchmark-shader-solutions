/**
 * Codegen spec of the Fabric component <ShaderBenchCompatStaticView>
 * (package.json `codegenConfig`: library "ShaderBenchCompatStaticSpec").
 * Native implementations:
 *   iOS     ios/ShaderBenchCompatStaticView.mm  (Metal, CADisplayLink)
 *   Android android/src/main/java/com/shaderbench/compatstatic/ (OpenGL ES 2.0)
 *
 * The view is generic: it renders the shader named `shader` with the 4
 * `periods` and the packed `params` (MAX_PARAMS floats, see src/registry.ts).
 * No shader source crosses the bridge: iOS loads <shader>.metallib from the
 * pod's resource bundle (compiled at build time), Android loads the asset
 * shader-bench-compat-static/<shader>.glsl (packaged by Gradle). The clock
 * and the phases are computed natively (t += dt * speed, double precision).
 *
 * Compatibility: `CodegenTypes` (types) and `codegenNativeComponent` are
 * exported from the 'react-native' root in 0.81 and 0.87, and the codegen
 * TypeScript parser of both reads qualified names (CodegenTypes.Float).
 * No deep `react-native/Libraries/...` import.
 */
import { codegenNativeComponent } from 'react-native';
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';

export interface NativeProps extends ViewProps {
  shader?: string;
  params?: ReadonlyArray<CodegenTypes.Float>;
  periods?: ReadonlyArray<CodegenTypes.Double>;
  speed?: CodegenTypes.WithDefault<CodegenTypes.Double, 1>;
}

export default codegenNativeComponent<NativeProps>(
  'ShaderBenchCompatStaticView',
) as HostComponent<NativeProps>;
