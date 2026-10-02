/**
 * Codegen spec of the Fabric component <ShaderBenchNativeView>
 * (package.json `codegenConfig`: library "ShaderBenchNativeSpec").
 * Native implementations:
 *   iOS     ios/ShaderBenchNativeView.mm  (Metal, CADisplayLink)
 *   Android android/src/main/java/com/shaderbench/nativeview/ (AGSL RuntimeShader)
 *
 * The view is generic: it renders the shader named `shader` (iOS:
 * <shader>.metallib in the pod's resource bundle; Android:
 * assets/shader-bench/<shader>.agsl) with the 4 `periods` and the packed
 * `params` (MAX_PARAMS floats, see src/registry.ts). The clock and the
 * phases are computed natively (t += dt * speed, double precision).
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
  'ShaderBenchNativeView',
) as HostComponent<NativeProps>;
