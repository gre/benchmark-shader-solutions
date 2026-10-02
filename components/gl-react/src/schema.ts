// schema.ts — public subpath "<package>/shaders": the param schema of the
// shaders this package ships, for building UIs (sliders). Read-only data;
// the registry itself stays internal. Identical in every @shader-bench/* package.
import { getShader, listShaders, type ParamSpec } from "./registry";
import "./shaders";
export type { ShaderName } from "./shaders";
export type { ParamSpec } from "./registry";

export type ShaderSchema = {
  name: string;
  /** Params in declaration order, then `speed` last. */
  params: Readonly<Record<string, ParamSpec>>;
};

/** Names of the shaders this package ships. */
export function shaderNames(): string[] {
  return listShaders();
}

/** Param schema of a shader (`speed` included, last); throws on unknown names. */
export function getShaderSchema(name: string): ShaderSchema {
  const def = getShader(name);
  return { name: def.name, params: { ...def.params, speed: def.speed } };
}
