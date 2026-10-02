/**
 * Codegen spec of the app-local Fabric component <SilkView>
 * (package.json `codegenConfig`, type "components", library "SilkViewSpec").
 * Native implementations:
 *   iOS     ios/RnBaseline/SilkView/RCTSilkView.mm   (Metal, CADisplayLink)
 *   Android android/app/src/main/java/com/effectstudy/nativecompatdyn/silk/ (OpenGL ES 2.0)
 *
 * `source`: the shader source, compiled at runtime by the view: Metal
 * Shading Language on iOS (src/shaders/silk.ios.ts), GLSL ES 1.00 on Android
 * (src/shaders/silk.android.ts).
 *
 * `frozenTime`: codegen cannot express `number | null` for a Double prop, so
 * a negative value (default -1) means "live clock"; >= 0 freezes the clock
 * at that many seconds.
 */
import { codegenNativeComponent } from 'react-native';
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';

export type FirstFrameEvent = Readonly<{
  /** ms between the native view creation and its first presented frame */
  ms: CodegenTypes.Double;
}>;

export type FrameStatsEvent = Readonly<{
  fps: CodegenTypes.Double;
  avgMs: CodegenTypes.Double;
  p95Ms: CodegenTypes.Double;
}>;

export interface NativeProps extends ViewProps {
  source?: string;
  paused?: CodegenTypes.WithDefault<boolean, false>;
  frozenTime?: CodegenTypes.WithDefault<CodegenTypes.Double, -1>;
  speed?: CodegenTypes.WithDefault<CodegenTypes.Float, 1>;
  onFirstFrame?: CodegenTypes.DirectEventHandler<FirstFrameEvent>;
  onFrameStats?: CodegenTypes.DirectEventHandler<FrameStatsEvent>;
}

export default codegenNativeComponent<NativeProps>(
  'SilkView',
) as HostComponent<NativeProps>;
