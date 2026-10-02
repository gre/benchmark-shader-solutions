#!/usr/bin/env node
// size: bundle / binary / node_modules / LOC metrics.
//   node size.mjs [--app web-skia,rn-baseline] [--reuse-build]
//   RN iOS:  --derived-data <path>   existing Xcode derivedData of a Release simulator build
//                                    (<path>/Build/Products/Release-iphonesimulator/*.app) or a direct .app path
//            --build                 build Release in a temp clone under /private/tmp/es-metrics/rn/<app> (slow; clone
//                                    does npm ci / bundle / pod install if needed). Needs one simulator device name: --sim es-metrics
//   Android: --apk <path> (with one --app)  breakdown of a release APK by top-level entry
import fs from "node:fs";
import path from "node:path";
import {
  WEB_APPS, RN_APPS, BASELINE, TMP, appDir, parseArgs, selectApps, saveResult, readJSON, walk, dirBytes, countInstalled,
  gz, br, fmtB, tryRun, cloneApp, hasApp,
} from "./lib.mjs";
import { buildWeb } from "./build-web.mjs";

const args = parseArgs();
const reuse = !!args["reuse-build"];

// ---------------- common: node_modules, LOC ----------------------------------
function loc(file) {
  const t = fs.readFileSync(file, "utf8").split("\n");
  if (t.at(-1) === "") t.pop();
  return { lines: t.length, nonBlank: t.filter((l) => l.trim()).length };
}
function locInfo(app) {
  const root = appDir(app);
  const src = path.join(root, "src");
  const out = { integration: { lines: 0, nonBlank: 0, files: {} }, shader: { lines: 0, nonBlank: 0, files: {} } };
  const codeExt = /\.(tsx?|jsx?|mjs|cjs|css|html|swift|m|mm|h|metal|kt|java|agsl|cpp)$/;
  for (const f of walk(src)) {
    if (!codeExt.test(f)) continue;
    const bucket = f.startsWith("shaders" + path.sep) ? out.shader : out.integration;
    const l = loc(path.join(src, f));
    bucket.lines += l.lines; bucket.nonBlank += l.nonBlank; bucket.files[path.join("src", f)] = l.lines;
  }
  // Shell files outside src/ are part of the shared baseline (App.tsx, index.js, index.html): reported apart.
  // Native code of rn-native / rn-native-compatible-* (ios/<Proj>/Silk*, android/**/Silk*, *.metal, *.agsl, *.glsl) counts as integration; report it.
  const nativeFiles = [];
  for (const sub of ["ios", "android"]) {
    for (const f of walk(path.join(root, sub))) {
      if (!/silk/i.test(path.basename(f)) || !/\.(swift|m|mm|h|metal|kt|java|agsl|glsl|cpp|cmake|txt)$/.test(f)) continue;
      const l = loc(path.join(root, sub, f));
      nativeFiles.push({ file: path.join(sub, f), ...l, isShader: /\.(metal|agsl|glsl)$/.test(f) });
    }
  }
  if (nativeFiles.length) out.native = nativeFiles;
  return out;
}
function nodeModulesInfo(app) {
  const nm = path.join(appDir(app), "node_modules");
  const lockP = path.join(appDir(app), "package-lock.json");
  const r = {};
  if (fs.existsSync(lockP)) r.lockfilePackages = Object.keys(readJSON(lockP).packages || {}).filter((k) => k).length;
  // Gradle outputs (android/build, .cxx) left inside node_modules by Android builds are not an install cost: excluded from `bytes`.
  const artifact = (p) => /[\\/]android[\\/](build|\.cxx)$/.test(p) || /[\\/]\.cxx$/.test(p);
  if (fs.existsSync(nm)) { r.bytes = dirBytes(nm, artifact); r.bytesIncludingGradleOutputs = dirBytes(nm); r.installedPackages = countInstalled(nm); }
  else r.note = "node_modules not installed";
  return r;
}

// ---------------- web ---------------------------------------------------------
function webDist(dir) {
  const dist = path.join(dir, "dist");
  const cat = { js: { n: 0, raw: 0, gzip: 0, brotli: 0 }, wasm: { n: 0, raw: 0, gzip: 0, brotli: 0 }, css: { n: 0, raw: 0, gzip: 0, brotli: 0 }, other: { n: 0, raw: 0, gzip: 0, brotli: 0 } };
  const files = [];
  for (const f of walk(dist, { skip: new Set() })) {
    const buf = fs.readFileSync(path.join(dist, f));
    const ext = path.extname(f);
    const c = /^\.(js|mjs)$/.test(ext) ? "js" : ext === ".wasm" ? "wasm" : ext === ".css" ? "css" : "other";
    const e = { file: f, cat: c, raw: buf.length, gzip: gz(buf), brotli: br(buf) };
    files.push(e);
    for (const k of ["raw", "gzip", "brotli"]) cat[c][k] += e[k];
    cat[c].n++;
  }
  const total = { raw: 0, gzip: 0, brotli: 0 };
  for (const c of Object.values(cat)) for (const k of Object.keys(total)) total[k] += c[k];
  return { categories: cat, total, files };
}

// ---------------- iOS ---------------------------------------------------------
function findApp(base) {
  if (base.endsWith(".app")) return base;
  const rel = path.join(base, "Build", "Products", "Release-iphonesimulator");
  if (!fs.existsSync(rel)) return null;
  const a = fs.readdirSync(rel).find((f) => f.endsWith(".app"));
  return a ? path.join(rel, a) : null;
}
function podCount(app) {
  const p = path.join(appDir(app), "ios", "Podfile.lock");
  if (!fs.existsSync(p)) return null;
  const sec = fs.readFileSync(p, "utf8").split(/^PODS:\n/m)[1]?.split(/^\n/m)[0] ?? "";
  return sec.split("\n").filter((l) => /^  - [^ (]+ \(/.test(l) && !l.match(/^  - [^ (]*\//)).length;
}
function iosApp(appPath) {
  const items = fs.readdirSync(appPath, { withFileTypes: true });
  const fw = [];
  const fwDir = path.join(appPath, "Frameworks");
  if (fs.existsSync(fwDir)) for (const e of fs.readdirSync(fwDir)) fw.push({ name: e, bytes: dirBytes(path.join(fwDir, e)) });
  fw.sort((a, b) => b.bytes - a.bytes);
  const exe = items.find((e) => e.isFile() && !/\.|^PkgInfo$/.test(e.name));
  const bundle = path.join(appPath, "main.jsbundle");
  const sizeOf = (p) => (fs.existsSync(p) ? fs.statSync(p).size : null);
  let hermes = null;
  if (fs.existsSync(bundle)) { const h = fs.readFileSync(bundle).subarray(0, 8); hermes = h.readUInt32LE(0) === 0x1f1903c1 || h.toString("hex").startsWith("c61fbc03") ? "hermes-bytecode" : "unknown/plain-js?"; }
  const total = dirBytes(appPath);
  const frameworks = fw.reduce((n, f) => n + f.bytes, 0);
  return {
    appPath, totalBytes: total, frameworksBytes: frameworks, frameworks: fw,
    mainBinaryBytes: exe ? sizeOf(path.join(appPath, exe.name)) : null, mainBinary: exe?.name,
    jsBundleBytes: sizeOf(bundle), jsBundleFormat: hermes,
    otherBytes: total - frameworks - (exe ? sizeOf(path.join(appPath, exe.name)) : 0) - (sizeOf(bundle) || 0),
    topLevel: items.filter((e) => !e.isDirectory() || e.name !== "Frameworks").map((e) => ({ name: e.name, bytes: e.isDirectory() ? dirBytes(path.join(appPath, e.name)) : sizeOf(path.join(appPath, e.name)) })).sort((a, b) => b.bytes - a.bytes).slice(0, 8),
  };
}
function buildIos(app) {
  const sim = args.sim || "es-metrics";
  const dir = cloneApp(app, "rn", { exclude: ["dist", "ios/build"] });
  const t = (label, cmd, a, cwd) => { const t0 = Date.now(); const r = tryRun(cmd, a, { cwd, env: { ...process.env, CI: "1" } }); console.log(`   ${label}: ${r.ok ? "ok" : "FAIL"} ${((Date.now() - t0) / 1000).toFixed(0)}s`); return { ...r, ms: Date.now() - t0 }; };
  const timings = {};
  if (!fs.existsSync(path.join(dir, "node_modules"))) { const r = t("npm ci", "npm", ["ci"], dir); if (!r.ok) return { error: r.out.slice(-500) }; timings.npmCiMs = r.ms; }
  if (!fs.existsSync(path.join(dir, "ios", "Pods"))) {
    t("bundle install", "bundle", ["install"], dir);
    const r = t("pod install", "bundle", ["exec", "pod", "install"], path.join(dir, "ios"));
    if (!r.ok) return { error: "pod install failed: " + r.out.slice(-500) };
    timings.podInstallMs = r.ms;
  }
  const ws = fs.readdirSync(path.join(dir, "ios")).find((f) => f.endsWith(".xcworkspace"));
  const scheme = ws.replace(".xcworkspace", "");
  const dd = path.join(TMP, "dd", app);
  const r = t("xcodebuild Release", "xcodebuild", ["-workspace", ws, "-scheme", scheme, "-configuration", "Release", "-sdk", "iphonesimulator", "-destination", `platform=iOS Simulator,name=${sim}`, "-derivedDataPath", dd, "build"], path.join(dir, "ios"));
  if (!r.ok) return { error: "xcodebuild failed: " + r.out.slice(-800) };
  timings.xcodebuildMs = r.ms;
  return { derivedData: dd, timings };
}

// ---------------- Android -----------------------------------------------------
function apkInfo(apk) {
  const r = tryRun("unzip", ["-v", apk]);
  if (!r.ok) return { error: "unzip failed" };
  const groups = {};
  let total = 0, comp = 0;
  for (const l of r.out.split("\n")) {
    const m = l.match(/^\s*(\d+)\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$/);
    if (!m) continue;
    const [raw, c, name] = [+m[1], +m[2], m[3]];
    const parts = name.split("/");
    const key = parts[0] === "lib" ? `lib/${parts[1]}` : parts[0] === "assets" ? `assets/${parts.slice(1).join("/")}` : parts.length === 1 ? name : parts[0] + "/";
    (groups[key] ||= { raw: 0, compressed: 0, files: 0 });
    groups[key].raw += raw; groups[key].compressed += c; groups[key].files++;
    total += raw; comp += c;
  }
  return { apkBytes: fs.statSync(apk).size, uncompressedBytes: total, entries: Object.entries(groups).map(([k, v]) => ({ entry: k, ...v })).sort((a, b) => b.compressed - a.compressed) };
}

// ================================ main =========================================
const all = [...WEB_APPS, ...RN_APPS];
const apps = selectApps(args, all);
const pf = (a) => (a.startsWith("web-") ? "web" : "rn");

// web
const webRes = {};
for (const app of apps.filter((a) => pf(a) === "web")) {
  console.log(`\n[web] ${app}`);
  const b = buildWeb(app, { reuse });
  if (b.error) { console.log("   skipped: " + b.error); continue; }
  const d = webDist(b.dir);
  if (!args.keep) fs.rmSync(b.dir, { recursive: true, force: true });
  webRes[app] = { ...d, buildMs: b.buildMs, loc: locInfo(app), nodeModules: nodeModulesInfo(app) };
}
if (apps.some((a) => pf(a) === "web")) {
  let base = webRes["web-baseline"];
  if (!base) { // baseline needed for deltas: read a previous result or build it
    try { base = readJSON(path.join(path.dirname(new URL(import.meta.url).pathname), "results", "size-web.json")).apps["web-baseline"]; } catch {}
  }
  for (const [app, r] of Object.entries(webRes)) {
    if (base && app !== "web-baseline") {
      r.deltaVsBaseline = { total: Object.fromEntries(Object.keys(r.total).map((k) => [k, r.total[k] - base.total[k]])), js: Object.fromEntries(["raw", "gzip", "brotli"].map((k) => [k, r.categories.js[k] - base.categories.js[k]])), nodeModulesBytes: r.nodeModules.bytes != null && base.nodeModules.bytes != null ? r.nodeModules.bytes - base.nodeModules.bytes : null };
    }
    saveResult("size-web.json", app, r);
    const c = r.categories;
    console.log(`${app.padEnd(14)} JS ${fmtB(c.js.raw)} (gz ${fmtB(c.js.gzip)}, br ${fmtB(c.js.brotli)})  WASM ${fmtB(c.wasm.raw)} (gz ${fmtB(c.wasm.gzip)}, br ${fmtB(c.wasm.brotli)})  total ${fmtB(r.total.raw)} gz ${fmtB(r.total.gzip)} br ${fmtB(r.total.brotli)}` + (r.deltaVsBaseline ? `  Δtotal raw ${fmtB(r.deltaVsBaseline.total.raw)} gz ${fmtB(r.deltaVsBaseline.total.gzip)}` : "") + `  node_modules ${fmtB(r.nodeModules.bytes)} / ${r.nodeModules.installedPackages} pkgs  LOC ${r.loc.integration.lines}+${r.loc.shader.lines}sh`);
  }
}

// RN iOS
const iosRes = {};
for (const app of apps.filter((a) => pf(a) === "rn")) {
  console.log(`\n[rn] ${app}`);
  const entry = { loc: locInfo(app), nodeModules: nodeModulesInfo(app), pods: podCount(app) };
  const singleApp = args.app && !String(args.app).includes(",");
  let dd = args["derived-data"] && singleApp ? args["derived-data"] : null;
  if (!dd && args["derived-data"] && !singleApp) { console.log("   --derived-data needs --app <one app>"); }
  if (!dd && args.build) {
    const b = buildIos(app);
    if (b.error) { console.log("   build failed: " + b.error); entry.buildError = b.error; }
    else { dd = b.derivedData; entry.buildTimings = b.timings; }
  }
  const appPath = dd ? findApp(dd) : null;
  if (appPath) { entry.ios = iosApp(appPath); entry.ios.source = dd; }
  else console.log("   no Release .app (pass --derived-data <path> --app " + app + " or --build); static metrics only");
  if (args.apk && singleApp) entry.android = apkInfo(args.apk);
  else if (args.apk) console.log("   --apk needs --app <one app>");
  iosRes[app] = entry;
}
if (Object.keys(iosRes).length) {
  let base = iosRes["rn-baseline"];
  if (!base) { try { base = readJSON(path.join(path.dirname(new URL(import.meta.url).pathname), "results", "size-ios.json")).apps["rn-baseline"]; } catch {} }
  for (const [app, r] of Object.entries(iosRes)) {
    if (base?.ios && r.ios && app !== "rn-baseline") {
      r.ios.deltaVsBaseline = { totalBytes: r.ios.totalBytes - base.ios.totalBytes, frameworksBytes: r.ios.frameworksBytes - base.ios.frameworksBytes, mainBinaryBytes: r.ios.mainBinaryBytes - base.ios.mainBinaryBytes, jsBundleBytes: r.ios.jsBundleBytes - base.ios.jsBundleBytes, pods: r.pods - base.pods };
    }
    if (base?.android && r.android && app !== "rn-baseline") r.android.deltaVsBaseline = { apkBytes: r.android.apkBytes - base.android.apkBytes };
    saveResult("size-ios.json", app, r);
    console.log(`${app}: pods ${r.pods}, node_modules ${fmtB(r.nodeModules.bytes)} / ${r.nodeModules.installedPackages ?? "-"} pkgs (lock ${r.nodeModules.lockfilePackages}), LOC ${r.loc.integration.lines}+${r.loc.shader.lines}sh`);
    if (r.ios) {
      console.log(`   .app ${fmtB(r.ios.totalBytes)} = Frameworks ${fmtB(r.ios.frameworksBytes)} + binary ${fmtB(r.ios.mainBinaryBytes)} + main.jsbundle ${fmtB(r.ios.jsBundleBytes)} (${r.ios.jsBundleFormat}) + other ${fmtB(r.ios.otherBytes)}` + (r.ios.deltaVsBaseline ? `  Δ ${fmtB(r.ios.deltaVsBaseline.totalBytes)}` : ""));
      console.log("   frameworks: " + r.ios.frameworks.map((f) => `${f.name} ${fmtB(f.bytes)}`).join(", "));
    }
    if (r.android) console.log(`   APK ${fmtB(r.android.apkBytes)}: ` + r.android.entries.slice(0, 6).map((e) => `${e.entry} ${fmtB(e.compressed)}`).join(", "));
  }
}
