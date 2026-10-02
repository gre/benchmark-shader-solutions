// The shaders this package ships. Adding one: create shaders/<name>/ and
// register it here (see README "Adding a shader").
import { registerShader } from "../registry";
import silk from "./silk";

export const SHADERS = { silk } as const;
export type ShaderName = keyof typeof SHADERS;

for (const def of Object.values(SHADERS)) registerShader(def);
