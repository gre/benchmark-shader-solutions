// Props shared by every platform (the platform `style` is added by each
// Effect.<platform>.tsx). Identical in every @shader-bench/* package.
import type { ParamValues } from "./registry";
import type { ShaderName } from "./shaders";

export type EffectBaseProps = {
  /** A registered shader name ("silk"). */
  shader: ShaderName;
  /** Param values by name, `speed` included; clamped to the shader's schema. */
  params?: Partial<ParamValues>;
};
