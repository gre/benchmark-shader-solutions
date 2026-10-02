// registry.ts — generic shader registry and uniform packing.
//
// This file is IDENTICAL in every @shader-bench/* package (no shared package
// on purpose: each package is standalone). Keep it byte-identical:
// `diff components/*/src/registry.ts` must print nothing.
//
// Uniform contract (identical in GLSL / SkSL / AGSL / WGSL / Metal):
//   resolution  vec2  render target size, in fragment-coordinate units
//   phase       vec4  fract(t / periods[i]), computed here in double precision
//   params      vec4[PARAM_VEC4S]  the shader's params in declaration order
//                     (params[0].x = 1st, .y = 2nd, …), unused slots 0
// GPU buffer layout (WGSL / Metal), 16-byte aligned, UNIFORM_FLOATS floats:
//   [0..1] resolution, [2..3] pad, [4..7] phase, [8..8+4*PARAM_VEC4S) params
// `speed` is not a uniform: it scales the clock on the CPU (t += dt * speed).

/** Number of vec4 in the `params` uniform array: up to 16 float params. */
export const PARAM_VEC4S = 4;
/** Maximum number of params a shader can declare. */
export const MAX_PARAMS = PARAM_VEC4S * 4;
/** Floats in the packed uniform buffer (resolution + pad + phase + params). */
export const UNIFORM_FLOATS = 8 + MAX_PARAMS;
/** Bytes of the packed uniform buffer (WGSL / Metal struct size). */
export const UNIFORM_BYTES = UNIFORM_FLOATS * 4;

export type ShaderLanguage = "glsl" | "sksl" | "agsl" | "wgsl" | "metal";

export type ParamSpec = {
  default: number;
  min: number;
  max: number;
  /** UI hint (sliders); not enforced. */
  step?: number;
};

export type ShaderDef = {
  name: string;
  /** Periods (s) of the 4 phases: phase[i] = fract(t / periods[i]). */
  periods: readonly [number, number, number, number];
  /** Params in declaration order = packing order into `params`. */
  params: Readonly<Record<string, ParamSpec>>;
  /** CPU-side time scale (not a uniform). */
  speed: ParamSpec;
  /** Only the languages this package needs at runtime from JS. */
  sources: Partial<Record<ShaderLanguage, string>>;
};

/** Param values by name, `speed` included. */
export type ParamValues = Record<string, number>;

export type Phases = [number, number, number, number];

function checkSpec(where: string, p: ParamSpec) {
  if (!(p.min <= p.default && p.default <= p.max)) {
    throw new Error(`${where}: default ${p.default} outside [${p.min}, ${p.max}]`);
  }
}

/** Validates and freezes a shader definition. */
export function defineShader<D extends ShaderDef>(def: D): D {
  const names = Object.keys(def.params);
  if (names.length > MAX_PARAMS) {
    throw new Error(`shader ${def.name}: ${names.length} params > MAX_PARAMS ${MAX_PARAMS}`);
  }
  if (names.includes("speed")) {
    throw new Error(`shader ${def.name}: "speed" is reserved (CPU-side time scale)`);
  }
  if (def.periods.length !== 4 || def.periods.some((p) => !(p > 0))) {
    throw new Error(`shader ${def.name}: periods must be 4 positive numbers`);
  }
  for (const n of names) checkSpec(`shader ${def.name}, param ${n}`, def.params[n]);
  checkSpec(`shader ${def.name}, speed`, def.speed);
  return Object.freeze(def);
}

const registry = new Map<string, ShaderDef>();

/** Adds a shader to this package's registry (later registration wins). */
export function registerShader(def: ShaderDef): void {
  registry.set(def.name, def);
}

/** Looks up a registered shader; throws on unknown names. */
export function getShader(name: string): ShaderDef {
  const def = registry.get(name);
  if (!def) {
    throw new Error(`unknown shader "${name}" (known: ${[...registry.keys()].join(", ")})`);
  }
  return def;
}

/** Names of the registered shaders, in registration order. */
export function listShaders(): string[] {
  return [...registry.keys()];
}

const clamp = (v: number, s: ParamSpec) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(s.max, Math.max(s.min, v)) : s.default;

/**
 * Full param values (declared params + speed): missing or non-finite values
 * take the default, others are clamped to [min, max], unknown keys dropped.
 */
export function resolveParams(def: ShaderDef, params?: Partial<ParamValues> | null): ParamValues {
  const out: ParamValues = {};
  for (const n of Object.keys(def.params)) out[n] = clamp(params?.[n] as number, def.params[n]);
  out.speed = clamp(params?.speed as number, def.speed);
  return out;
}

/**
 * Phases in [0, 1) for the (already speed-scaled) time t in seconds,
 * computed in JS doubles: ((t / P) % 1 + 1) % 1.
 */
export function computePhases(def: ShaderDef, t: number): Phases {
  const p = def.periods;
  const f = (P: number) => (((t / P) % 1) + 1) % 1;
  return [f(p[0]), f(p[1]), f(p[2]), f(p[3])];
}

/**
 * The flat `params` uniform: MAX_PARAMS floats, declaration order, unused 0.
 * `values` should come from resolveParams (missing names are 0 here).
 */
export function packParams(
  def: ShaderDef,
  values: ParamValues,
  out: Float32Array = new Float32Array(MAX_PARAMS),
): Float32Array {
  out.fill(0);
  Object.keys(def.params).forEach((n, i) => {
    out[i] = values[n] ?? 0;
  });
  return out;
}

/**
 * The whole uniform buffer in the canonical GPU layout (UNIFORM_FLOATS
 * floats): resolution, pad, phase(t), params. `t` is the speed-scaled time.
 */
export function packUniforms(
  def: ShaderDef,
  u: { width: number; height: number; t: number; params: ParamValues },
  out: Float32Array = new Float32Array(UNIFORM_FLOATS),
): Float32Array {
  out[0] = u.width;
  out[1] = u.height;
  out[2] = 0;
  out[3] = 0;
  out.set(computePhases(def, u.t), 4);
  packParams(def, u.params, out.subarray(8));
  return out;
}

/** Stable key of a params object, for memoization (React deps). */
export function paramsKey(params?: Partial<ParamValues> | null): string {
  if (!params) return "";
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}
