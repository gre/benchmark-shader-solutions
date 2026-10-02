#!/usr/bin/env node
// check-stack: per platform, compare resolved versions (package-lock.json) of every package shared with the
// platform baseline; list extra deps / pods; list files that differ from the baseline outside the expected ones.
// Usage: node check-stack.mjs [--app a,b] [--json]
import fs from "node:fs";
import path from "node:path";
import { WEB_APPS, RN_APPS, BASELINE, appDir, hasApp, parseArgs, selectApps, readJSON, saveWhole, walk } from "./lib.mjs";

const args = parseArgs();

function lockPackages(app) {
  const lp = path.join(appDir(app), "package-lock.json");
  if (!fs.existsSync(lp)) return null;
  const lock = readJSON(lp);
  const map = new Map(); // name -> Set(versions)
  for (const [k, v] of Object.entries(lock.packages || {})) {
    if (!k) continue;
    const name = k.slice(k.lastIndexOf("node_modules/") + "node_modules/".length);
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(v.version);
  }
  return { map, count: [...map.values()].reduce((n, s) => n + s.size, 0), lock };
}
function pods(app) {
  const p = path.join(appDir(app), "ios", "Podfile.lock");
  if (!fs.existsSync(p)) return null;
  const txt = fs.readFileSync(p, "utf8");
  const sec = txt.split(/^PODS:\n/m)[1]?.split(/^\n|^[A-Z]/m)[0] ?? "";
  const m = new Map();
  for (const l of sec.split("\n")) {
    const r = l.match(/^  - ([^ (]+) \(([^)]+)\)/);
    if (r && !r[1].includes("/")) m.set(r[1], r[2]); // top-level pods only (no subspecs)
  }
  return m;
}

// ---- file diff vs baseline -------------------------------------------------
const norm = (s) => s
  .replace(/com\.effectstudy\.\w+/g, "com.effectstudy.X")
  .replace(/\b(web|rn)-(baseline|gl-react|skia|webgpu|webgl|native-compatible-static|native-compatible-dynamic|native)\b/g, "APP")
  .replace(/\b(Web|Rn)(Baseline|GlReact|Skia|Webgpu|Webgl|NativeCompatibleStatic|NativeCompatibleDynamic|Native)\b/g, "APPN")
  .replace(/\bes-APP\b/g, "SIM")
  .replace(/\b(517\d|809\d)\b/g, "PORT")
  .replace(/\bPORT\b/g, "PORT");
const EXPECTED = [
  [/^src\/Effect\.tsx$/, "Effect"],
  [/^src\/shaders\//, "shader"],
  [/^README\.md$/, "README"],
  [/^package-lock\.json$/, "lockfile (extra deps)"],
  [/^ios\/Podfile\.lock$/, "lockfile (extra pods)"],
  [/^Gemfile\.lock$/, "lockfile"],
];
// Documented deviations (each app's README explains them): classified apart from truly unexpected diffs.
const DOCUMENTED = {
  "web-gl-react": [/^vite\.config\.ts$/],
  "web-skia": [/^src\/canvaskit\.ts$/],
  "rn-gl-react": [/^ios\/Podfile$/, /^ios\/RnBaseline\/(AppDelegate\.swift|PrivacyInfo\.xcprivacy)$/, /^ios\/RnBaseline\.xcodeproj\//, /^patches\//, /^package\.json#overrides$/],
  "rn-webgpu": [/^ios\/Podfile$/, /^patches\//],
  "rn-skia": [/^patches\//],
  "rn-native": [/^android\//, /^ios\//, /^src\/(nativeStats\.ts|FpsOverlay\.tsx|specs\/)/, /^package\.json#codegenConfig$/],
  "rn-native-compatible-static": [/^android\//, /^ios\//, /^src\/(nativeStats\.ts|FpsOverlay\.tsx|specs\/)/, /^package\.json#codegenConfig$/, /^screenshots\//],
  "rn-native-compatible-dynamic": [/^android\//, /^ios\//, /^src\/(nativeStats\.ts|FpsOverlay\.tsx|specs\/)/, /^package\.json#codegenConfig$/, /^screenshots\//],
};
const ANDROID_REMOVED = /^android\//;
function diffFiles(app, base) {
  const a = appDir(app), b = appDir(base);
  const fa = new Set(walk(a)), fb = new Set(walk(b));
  const res = { expected: [], renameOnly: [], unexpected: [], added: [], removed: [] };
  for (const f of fa) {
    if (!fb.has(f)) { (EXPECTED.some(([r]) => r.test(f)) ? res.expected : res.added).push(f); continue; }
    const x = fs.readFileSync(path.join(a, f)), y = fs.readFileSync(path.join(b, f));
    if (x.equals(y)) continue;
    const exp = EXPECTED.find(([r]) => r.test(f));
    if (exp) { res.expected.push(f); continue; }
    if (f === "package.json") { res.expected.push(f); continue; } // checked field by field via pkgDiff
    const isText = !x.includes(0) && !y.includes(0);
    if (isText && norm(x.toString("utf8")) === norm(y.toString("utf8"))) res.renameOnly.push(f);
    else res.unexpected.push(f);
  }
  for (const f of fb) if (!fa.has(f)) res.removed.push(f);
  // ignore generated Xcode user data etc. already skipped by walk
  return res;
}
/** package.json: report what differs beyond name/ports/deps */
function pkgDiff(app, base) {
  const x = readJSON(path.join(appDir(app), "package.json")), y = readJSON(path.join(appDir(base), "package.json"));
  const strip = (p) => { const c = JSON.parse(norm(JSON.stringify(p))); delete c.dependencies; delete c.devDependencies; return c; };
  const sx = strip(x), sy = strip(y);
  const keys = new Set([...Object.keys(sx), ...Object.keys(sy)]);
  const diff = [];
  for (const k of keys) if (JSON.stringify(sx[k]) !== JSON.stringify(sy[k])) diff.push(k);
  const dd = (f) => {
    const out = { added: {}, removed: {}, changed: {} };
    const px = { ...y[f] }, qx = { ...x[f] };
    for (const [n, v] of Object.entries(qx)) { if (!(n in px)) out.added[n] = v; else if (px[n] !== v) out.changed[n] = `${px[n]} -> ${v}`; }
    for (const n of Object.keys(px)) if (!(n in qx)) out.removed[n] = px[n];
    return out;
  };
  return { otherFieldsDiffer: diff, dependencies: dd("dependencies"), devDependencies: dd("devDependencies"), nonExactRanges: Object.entries({ ...x.dependencies, ...x.devDependencies }).filter(([, v]) => /^[\^~<>*]|x$/.test(v)).map(([n, v]) => `${n}@${v}`) };
}

const results = {};
let totalMismatch = 0;
for (const [plat, all] of [["web", WEB_APPS], ["rn", RN_APPS]]) {
  const base = BASELINE[plat];
  const apps = selectApps(args, all);
  if (!apps.includes(base)) { if (hasApp(base) && apps.length) apps.unshift(base); else { console.log(`[${plat}] baseline ${base} missing, skipped`); continue; } }
  const B = lockPackages(base);
  if (!B) { console.log(`[${plat}] no lockfile for ${base}`); continue; }
  const Bpods = pods(base);
  console.log(`\n=== ${plat.toUpperCase()}  (baseline ${base}: ${B.map.size} package names, ${B.count} instances${Bpods ? ", " + Bpods.size + " pods" : ""})`);
  for (const app of apps) {
    if (app === base) continue;
    const L = lockPackages(app);
    if (!L) { console.log(`- ${app}: no package-lock.json yet, skipped`); continue; }
    const mismatches = [], extraCopies = [];
    for (const [n, vs] of B.map) {
      if (!L.map.has(n)) continue;
      const av = L.map.get(n);
      const same = vs.size === av.size && [...vs].every((v) => av.has(v));
      const superset = [...vs].every((v) => av.has(v)); // baseline version still present, plus an extra nested copy
      if (!same && superset) extraCopies.push({ name: n, baseline: [...vs].sort(), app: [...av].sort() });
      else if (!same) mismatches.push({ name: n, baseline: [...vs].sort(), app: [...av].sort() });
    }
    const extra = [...L.map.keys()].filter((n) => !B.map.has(n)).sort();
    const missing = [...B.map.keys()].filter((n) => !L.map.has(n)).sort();
    const P = pods(app);
    let podInfo = null;
    if (Bpods) {
      if (P) {
        const podMis = [...Bpods].filter(([n, v]) => P.has(n) && P.get(n) !== v).map(([n, v]) => ({ name: n, baseline: v, app: P.get(n) }));
        podInfo = { baseline: Bpods.size, app: P.size, extra: [...P.keys()].filter((n) => !Bpods.has(n)).sort(), missing: [...Bpods.keys()].filter((n) => !P.has(n)), mismatches: podMis };
      } else podInfo = { note: "no ios/Podfile.lock (pod install not run yet)" };
    }
    const files = diffFiles(app, base), pj = pkgDiff(app, base);
    for (const k of pj.otherFieldsDiffer) if (k !== "scripts") files.unexpected.push(`package.json#${k}`);
    const rules = DOCUMENTED[app] || [];
    const isDoc = (f) => rules.some((r) => r.test(f)) || (plat === "rn" && app !== "rn-native" && false);
    files.documented = [...files.unexpected.filter(isDoc), ...files.added.filter(isDoc)];
    files.unexpected = files.unexpected.filter((f) => !isDoc(f));
    files.added = files.added.filter((f) => !isDoc(f));
    files.androidRemoved = plat === "rn" && !app.startsWith("rn-native") && files.removed.some((f) => ANDROID_REMOVED.test(f));
    if (files.androidRemoved) files.removed = files.removed.filter((f) => !ANDROID_REMOVED.test(f));
    const mm = mismatches.length + (podInfo?.mismatches?.length || 0);
    totalMismatch += mm;
    results[app] = { platform: plat, baseline: base, sharedMismatches: mismatches, extraNestedCopies: extraCopies, packageNamesApp: L.map.size, instancesApp: L.count, extraPackages: extra, extraInstances: L.count - B.count, missingFromBaseline: missing, pods: podInfo, packageJson: pj, files };
    console.log(`\n## ${app}  — ${mismatches.length} shared-package version mismatches${podInfo?.mismatches ? `, ${podInfo.mismatches.length} pod mismatches` : ""}`);
    for (const m of mismatches) console.log(`   MISMATCH ${m.name}: baseline ${m.baseline.join(",")} vs ${m.app.join(",")}`);
    if (extraCopies.length) console.log(`   info: ${extraCopies.length} packages keep the baseline version but also have an extra nested copy (e.g. ${extraCopies.slice(0, 3).map((m) => m.name + " +" + m.app.filter((v) => !m.baseline.includes(v)).join("/")).join(", ")}); full list in JSON`);
    console.log(`   direct deps added: ${JSON.stringify(pj.dependencies.added)} dev: ${JSON.stringify(pj.devDependencies.added)}`);
    if (Object.keys(pj.dependencies.changed).length + Object.keys(pj.devDependencies.changed).length) console.log(`   direct deps CHANGED: ${JSON.stringify({ ...pj.dependencies.changed, ...pj.devDependencies.changed })}`);
    if (Object.keys(pj.dependencies.removed).length + Object.keys(pj.devDependencies.removed).length) console.log(`   direct deps REMOVED: ${JSON.stringify({ ...pj.dependencies.removed, ...pj.devDependencies.removed })}`);
    if (pj.nonExactRanges.length) console.log(`   NON-EXACT ranges: ${pj.nonExactRanges.join(", ")}`);
    if (pj.otherFieldsDiffer.length) console.log(`   package.json other fields differ: ${pj.otherFieldsDiffer.join(", ")} (name/ports normalised; scripts = android script removed, overrides, codegenConfig…)`);
    console.log(`   transitive: ${extra.length} extra package names (${L.count - B.count >= 0 ? "+" : ""}${L.count - B.count} instances): ${extra.slice(0, 40).join(", ")}${extra.length > 40 ? ", …" : ""}`);
    if (missing.length) console.log(`   missing vs baseline: ${missing.join(", ")}`);
    if (podInfo) console.log(podInfo.note ? `   pods: ${podInfo.note}` : `   pods: ${podInfo.app} vs ${podInfo.baseline} baseline, extra: ${podInfo.extra.join(", ") || "none"}${podInfo.missing.length ? "; missing: " + podInfo.missing.join(", ") : ""}`);
    console.log(`   files: expected-diff ${files.expected.length} (${files.expected.join(", ")}); rename-only ${files.renameOnly.length}; added ${files.added.length}; removed ${files.removed.length}`);
    const grp = (list) => { const m = new Map(); for (const f of list) { const k = f.split("/").slice(0, f.startsWith("src/") ? 2 : 1)[0] === "src" ? f : f.split("/")[0] + (f.includes("/") ? "/" : ""); m.set(k, (m.get(k) || 0) + 1); } return [...m]; };
    for (const [f, n] of grp(files.added)) console.log(`   ADDED (not in baseline): ${f}${n > 1 ? ` (${n} files)` : ""}`);
    for (const [f, n] of grp(files.removed)) console.log(`   REMOVED vs baseline: ${f}${n > 1 ? ` (${n} files)` : ""}`);
    if (files.androidRemoved) console.log("   expected: no android/ (iOS-only app, PLAN §1)");
    for (const f of files.documented) console.log(`   documented deviation (see apps/${app}/README.md): ${f}`);
    for (const f of files.unexpected) console.log(`   UNEXPECTED DIFF: ${f}`);
  }
}
saveWhole("check-stack.json", { totalSharedMismatches: totalMismatch, apps: results });
console.log(`\nTOTAL shared-version mismatches: ${totalMismatch}  (results/check-stack.json)`);
process.exitCode = totalMismatch ? 1 : 0;
