// check-shared.mjs — the generic files duplicated in every @shader-bench/*
// package must stay byte-identical. Usage: node components/scripts/check-shared.mjs
// Exits 1 on any difference or missing file. No dependencies.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHARED = ["src/registry.ts", "src/types.ts", "src/schema.ts", "src/shaders/index.ts"];

const pkgs = fs
  .readdirSync(ROOT)
  .filter((d) => fs.existsSync(path.join(ROOT, d, "package.json")))
  .filter((d) => JSON.parse(fs.readFileSync(path.join(ROOT, d, "package.json"), "utf8")).name?.startsWith("@shader-bench/"));

let ok = true;
for (const file of SHARED) {
  const contents = new Map();
  for (const p of pkgs) {
    const f = path.join(ROOT, p, file);
    if (!fs.existsSync(f)) {
      console.log(`MISSING ${p}/${file}`);
      ok = false;
      continue;
    }
    const c = fs.readFileSync(f, "utf8");
    if (!contents.has(c)) contents.set(c, []);
    contents.get(c).push(p);
  }
  if (contents.size > 1) {
    ok = false;
    console.log(`DIFFERS ${file}: ${[...contents.values()].map((g) => g.join(",")).join(" | ")}`);
  } else if (contents.size === 1) {
    console.log(`same    ${file} (${pkgs.join(", ")})`);
  }
}
process.exit(ok ? 0 : 1);
