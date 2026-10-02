// Shared helpers for the metrics scripts. Apps in ../apps are READ-ONLY.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");
export const APPS_DIR = path.join(ROOT, "apps");
export const RESULTS = path.join(HERE, "results");
export const TMP = "/private/tmp/es-metrics";

export const WEB_APPS = ["web-baseline", "web-gl-react", "web-skia", "web-webgpu", "web-webgl"];
export const RN_APPS = ["rn-baseline", "rn-gl-react", "rn-skia", "rn-webgpu", "rn-native", "rn-native-compatible-static", "rn-native-compatible-dynamic"];
export const BASELINE = { web: "web-baseline", rn: "rn-baseline" };
export const platformOf = (app) => (app.startsWith("web-") ? "web" : "rn");
export const appDir = (app) => path.join(APPS_DIR, app);
export const hasApp = (app) => fs.existsSync(path.join(appDir(app), "package.json"));

export function parseArgs(argv = process.argv.slice(2)) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) o[k] = true;
      else { o[k] = next; i++; }
    } else o._.push(a);
  }
  return o;
}
/** Apps selected by --app (comma list) among `all`, else all that exist. */
export function selectApps(args, all) {
  const want = args.app && args.app !== true ? String(args.app).split(",") : all;
  const out = [];
  for (const a of want) {
    if (!all.includes(a)) { console.log(`skip ${a}: not in this script's scope`); continue; }
    if (!hasApp(a)) { console.log(`skip ${a}: apps/${a}/package.json missing`); continue; }
    out.push(a);
  }
  return out;
}

export function sh(cmd, argv, opts = {}) {
  return execFileSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"], ...opts });
}
export function tryRun(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
  return { ok: r.status === 0, out: (r.stdout || "") + (r.stderr || ""), status: r.status };
}

export function readJSON(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
export function saveResult(file, key, data) {
  fs.mkdirSync(RESULTS, { recursive: true });
  const p = path.join(RESULTS, file);
  let cur = {};
  try { cur = readJSON(p); } catch {}
  cur.generatedAt = new Date().toISOString();
  cur.apps = { ...(cur.apps || {}), ...(key ? { [key]: data } : {}) };
  fs.writeFileSync(p, JSON.stringify(cur, null, 2) + "\n");
  return p;
}
export function saveWhole(file, data) {
  fs.mkdirSync(RESULTS, { recursive: true });
  fs.writeFileSync(path.join(RESULTS, file), JSON.stringify({ generatedAt: new Date().toISOString(), ...data }, null, 2) + "\n");
}

export const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
export const br = (buf) => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length;

export const SKIP_DIRS = new Set(["node_modules", "dist", "Pods", "build", "vendor", ".git", "DerivedData", ".gradle", ".bundle", "xcuserdata", ".idea", ".cxx", ".expo"]);
export function walk(dir, { skip = SKIP_DIRS, rel = "" } = {}) {
  const out = [];
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.isDirectory()) { if (skip.has(e.name)) continue; out.push(...walk(path.join(dir, e.name), { skip, rel: path.join(rel, e.name) })); }
    else if (e.isFile()) out.push(path.join(rel, e.name));
  }
  return out;
}
/** skipFn(absPath) -> true to exclude a directory (used to ignore Gradle build outputs inside node_modules). */
export function dirBytes(dir, skipFn = null) {
  let n = 0;
  const st = (p) => { try { return fs.lstatSync(p); } catch { return null; } };
  const rec = (d) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!(skipFn && skipFn(p))) rec(p); }
      else { const s = st(p); if (s && s.isFile()) n += s.size; }
    }
  };
  rec(dir);
  return n;
}
/** Count installed packages (dirs with package.json) in node_modules incl. nested ones. */
export function countInstalled(nm) {
  let n = 0;
  const rec = (d) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      if (e.name.startsWith("@")) { rec(p); continue; }
      if (fs.existsSync(path.join(p, "package.json"))) {
        n++;
        const nested = path.join(p, "node_modules");
        if (fs.existsSync(nested)) rec(nested);
      }
    }
  };
  rec(nm);
  return n;
}
export const fmtB = (n) => n == null ? "-" : n >= 1e6 ? (n / 1e6).toFixed(2) + " MB" : n >= 1e3 ? (n / 1e3).toFixed(1) + " kB" : n + " B";

export function machine() {
  const q = (c, a) => { try { return sh(c, a).trim(); } catch { return null; } };
  let hw = null;
  try {
    const t = sh("system_profiler", ["SPHardwareDataType", "SPDisplaysDataType"]);
    hw = t.split("\n").map((l) => l.trim()).filter((l) => /Model Name|Model Identifier|Chip|Total Number of Cores|Memory|Resolution|GPU|Refresh|UI Looks like|Display Type|Metal/i.test(l));
  } catch {}
  return {
    cpu: q("sysctl", ["-n", "machdep.cpu.brand_string"]),
    ncpu: os.cpus().length,
    memBytes: os.totalmem(),
    os: q("sw_vers", ["-productVersion"]),
    kernel: os.release(),
    node: process.version,
    xcode: q("xcodebuild", ["-version"])?.split("\n")[0] ?? null,
    hardware: hw,
  };
}

/** Clone (APFS copy-on-write, falls back to normal copy) apps/<app> into TMP/<sub>/<app>, minus build outputs. */
export function cloneApp(app, sub, { keepNodeModules = true, exclude = ["dist", "ios/build", "ios/Pods", "vendor"] } = {}) {
  const dst = path.join(TMP, sub, app);
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });
  const src = appDir(app);
  const ex = [...exclude, ...(keepNodeModules ? [] : ["node_modules"]), ".git"];
  // rsync keeps it simple and supports excludes; --link-dest not needed (node_modules is ~70-100 MB)
  const args = ["-a", ...ex.flatMap((e) => ["--exclude", "/" + e]), src + "/", dst + "/"];
  sh("rsync", args);
  return dst;
}
