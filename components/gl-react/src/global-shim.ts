// gl-react's dependencies (raf, typedarray-pool, …) read Node's `global` at
// module evaluation time. Browsers and Vite 8 do not define it; apps/web-gl-react
// needed `define: { global: "globalThis" }` in the APP's Vite config.
// Defining it here, in a module imported BEFORE gl-react (ES modules evaluate
// imports in order), removes that requirement from the consumer.
const g = globalThis as { global?: unknown };
if (typeof g.global === "undefined") g.global = globalThis;
export {};
