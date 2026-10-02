#!/usr/bin/env node
// report: merge results/*.json into markdown tables (stdout; redirect into RESULTS.md as needed).
// Usage: node report.mjs [> report.md]
import path from "node:path";
import fs from "node:fs";
import { RESULTS, WEB_APPS, RN_APPS, fmtB, readJSON } from "./lib.mjs";

const load = (f) => { try { return readJSON(path.join(RESULTS, f)); } catch { return null; } };
const kb = (n) => (n == null ? "-" : n >= 1e6 ? (n / 1e6).toFixed(2) + " MB" : (n / 1e3).toFixed(1) + " kB");
const sgn = (n, f = kb) => (n == null ? "-" : (n > 0 ? "+" : n < 0 ? "-" : "") + f(Math.abs(n)));
const ms = (x) => (x == null ? "-" : x.toFixed(2));
const table = (head, rows) => ["| " + head.join(" | ") + " |", "|" + head.map(() => "---").join("|") + "|", ...rows.map((r) => "| " + r.join(" | ") + " |")].join("\n");
const out = [];
const h = (t) => out.push("\n" + t + "\n");

const mach = load("machine.json");
if (mach) {
  h("## Machine");
  out.push(`${mach.cpu} (${mach.ncpu} cores), ${(mach.memBytes / 2 ** 30).toFixed(0)} GB, macOS ${mach.os}, Node ${mach.node}, ${mach.xcode ?? ""}`);
  if (mach.hardware) out.push("\n" + mach.hardware.map((l) => "- " + l).join("\n"));
}

const cs = load("check-stack.json");
if (cs) {
  h("## Stack consistency (check-stack)");
  out.push(`Shared-package version mismatches vs platform baseline: **${cs.totalSharedMismatches}**\n`);
  out.push(table(["app", "mismatches", "extra pkg names", "extra instances", "extra pods", "unexpected file diffs"],
    Object.entries(cs.apps).map(([a, r]) => [a, r.sharedMismatches.length + (r.pods?.mismatches?.length || 0), r.extraPackages.length, r.extraInstances, r.pods?.extra ? r.pods.extra.join(", ") || "0" : "-", r.files.unexpected.join(", ") || "none"])));
}

const sw = load("size-web.json");
if (sw) {
  h("## Web bundle size (production build)");
  const A = WEB_APPS.filter((a) => sw.apps[a]);
  out.push(table(["app", "JS raw", "JS gzip", "JS br", "WASM raw", "WASM gzip", "WASM br", "total raw", "total gzip", "total br", "Δ raw vs baseline", "Δ gzip vs baseline"],
    A.map((a) => { const r = sw.apps[a], c = r.categories; return [a, kb(c.js.raw), kb(c.js.gzip), kb(c.js.brotli), c.wasm.n ? kb(c.wasm.raw) : "-", c.wasm.n ? kb(c.wasm.gzip) : "-", c.wasm.n ? kb(c.wasm.brotli) : "-", kb(r.total.raw), kb(r.total.gzip), kb(r.total.brotli), r.deltaVsBaseline ? sgn(r.deltaVsBaseline.total.raw) : "-", r.deltaVsBaseline ? sgn(r.deltaVsBaseline.total.gzip) : "-"]; })));
  h("### Web node_modules and LOC");
  out.push(table(["app", "node_modules", "installed pkgs", "lockfile pkgs", "integration LOC (src minus shaders)", "shader LOC"],
    A.map((a) => { const r = sw.apps[a]; return [a, kb(r.nodeModules.bytes), r.nodeModules.installedPackages ?? "-", r.nodeModules.lockfilePackages ?? "-", r.loc.integration.lines, r.loc.shader.lines || "-"]; })));
}

const si = load("size-ios.json");
if (si) {
  h("## iOS size (Release simulator build) and RN node_modules");
  const A = RN_APPS.filter((a) => si.apps[a]);
  out.push(table(["app", ".app", "Δ vs baseline", "Frameworks", "binary", "main.jsbundle", "pods", "node_modules", "installed pkgs", "integration LOC", "shader LOC"],
    A.map((a) => { const r = si.apps[a], i = r.ios; return [a, i ? kb(i.totalBytes) : "-", i?.deltaVsBaseline ? sgn(i.deltaVsBaseline.totalBytes) : "-", i ? kb(i.frameworksBytes) : "-", i ? kb(i.mainBinaryBytes) : "-", i ? kb(i.jsBundleBytes) : "-", r.pods ?? "-", kb(r.nodeModules.bytes), r.nodeModules.installedPackages ?? "-", r.loc.integration.lines + (r.loc.native ? ` (+${r.loc.native.filter((n) => !n.isShader).reduce((s, n) => s + n.lines, 0)} native)` : ""), r.loc.shader.lines + (r.loc.native ? r.loc.native.filter((n) => n.isShader).reduce((s, n) => s + n.lines, 0) : 0) || "-"]; })));
  for (const a of A) if (si.apps[a].ios) out.push(`\n${a} Frameworks: ` + si.apps[a].ios.frameworks.map((f) => `${f.name} ${kb(f.bytes)}`).join(", "));
  const apk = A.filter((a) => si.apps[a].android);
  if (apk.length) {
    h("### Android release APK");
    out.push(table(["app", "APK", "Δ vs baseline", "top entries (compressed)"], apk.map((a) => { const r = si.apps[a].android; return [a, kb(r.apkBytes), r.deltaVsBaseline ? sgn(r.deltaVsBaseline.apkBytes) : "-", r.entries.slice(0, 6).map((e) => `${e.entry} ${kb(e.compressed)}`).join(", ")]; })));
  }
}

const pw = load("perf-web.json");
const mm = (xs, f = (x) => x.toFixed(1)) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); if (!s.length) return "-"; const m = s[Math.floor(s.length / 2)]; return s.length > 1 && s[0] !== s.at(-1) ? `${f(m)} (${f(s[0])}-${f(s.at(-1))})` : f(m); };
if (pw) {
  h("## Web performance (headed Chromium, hardware GPU)");
  const A = WEB_APPS.filter((a) => pw.apps[a]);
  const any = pw.apps[A[0]];
  if (any) out.push(`Chromium ${any.chromium}, flags \`${any.flags.join(" ")}\`, ${any.seconds} s per run, ${any.reps ?? 1} repetitions (cells: median (min-max)); WebGL renderer: ${JSON.stringify(any.renderer?.webgl?.renderer ?? "?")}; WebGPU adapter: ${JSON.stringify(any.renderer?.webgpu)}. Display refreshes at 120 Hz, so frame times are vsync-capped at 8.33 ms.\n`);
  const rows = [];
  for (const a of A) {
    const e = pw.apps[a];
    for (const vp of [...new Set(e.runs.map((r) => r.viewport))]) {
      const rs = e.runs.filter((r) => r.viewport === vp && !r.error);
      if (!rs.length) continue;
      rows.push([a, vp, mm(rs.map((r) => r.firstFrameMs), (x) => x.toFixed(0)), mm(rs.map((r) => r.frame.avg), (x) => x.toFixed(2)), mm(rs.map((r) => r.frame.p95), (x) => x.toFixed(2)), mm(rs.map((r) => r.frame.max), (x) => x.toFixed(1)), mm(rs.map((r) => r.jsHeapBytes / 1e6), (x) => x.toFixed(1)), mm(rs.map((r) => r.cpuPercentOfOneCore.GPU)), mm(rs.map((r) => r.cpuPercentOfOneCore.renderer)), mm(rs.map((r) => r.cpuPercentOfOneCore.browser)), mm(rs.map((r) => (r.cpuPercentOfOneCore.GPU ?? 0) + (r.cpuPercentOfOneCore.renderer ?? 0) + (r.cpuPercentOfOneCore.browser ?? 0)))]);
    }
  }
  out.push(table(["app", "viewport", "TTFF ms", "avg frame ms", "p95 ms", "max ms", "JS heap MB", "CPU% GPU proc", "CPU% renderer", "CPU% browser", "CPU% total"], rows));
  out.push("\nCPU % = share of one core summed over processes of that type (CDP SystemInfo.getProcessInfo cpuTime delta over the 10 s window). TTFF = window.__firstFrame, ms after navigation start (localhost, includes wasm load). Median TTFF of 3 extra fresh loads at 1280x800: " + A.map((a) => `${a} ${pw.apps[a].timeToFirstFrameMs?.median ?? "-"}`).join(", ") + ".");
}

const pi = load("perf-ios.json");
if (pi) {
  h("## iOS performance (Simulator, Release; NOT representative of a device GPU)");
  // keys: "<app>" or "<app>@<suffix>" (e.g. @launch5: 5 short cold launches for first frame / shader setup)
  const A = Object.keys(pi.apps).filter((k) => RN_APPS.includes(k.split("@")[0])).sort((x, y) => (x.includes("@") - y.includes("@")) || RN_APPS.indexOf(x.split("@")[0]) - RN_APPS.indexOf(y.split("@")[0]));
  const f = (x, d = 1) => (x ? (x.min === x.max ? x.median.toFixed(d) : `${x.median.toFixed(d)} (${x.min.toFixed(d)}-${x.max.toFixed(d)})`) : "-");
  const m = (x) => (x ? (x.min === x.max ? (x.median / 1e6).toFixed(0) : `${(x.median / 1e6).toFixed(0)} (${(x.min / 1e6).toFixed(0)}-${(x.max / 1e6).toFixed(0)})`) : "-");
  out.push(table(["app", "reps x s", "app CPU% (of one core)", "RSS avg MB", "RSS max MB", "first frame ms (JS start)", "shader setup ms", "backboardd+SpringBoard CPU%", "notes"],
    A.map((a) => { const r = pi.apps[a]; return [a, `${r.reps} x ${r.secondsPerRep}`, f(r.cpuPercentAvg), m(r.rssAvgBytes), m(r.rssMaxBytes), f(r.firstFrameMs, 0), f(r.shaderSetupMs), f(r.otherDeviceCpuPercentAvg), r.note ?? ""]; })));
}
const pa = load("perf-android.json");
if (pa) {
  h("## Android performance (release APKs, Samsung Galaxy S21 Ultra)");
  out.push("Device keys: `@s21-r1/r2` first device pass (PSS polled during the run), `@s21-a1/a2` adaptive refresh (48-120 Hz) and `@s21-60hz-1/2` display locked at 60 Hz (both with `--pss-once`). One run of 20 s per key; refresh = SurfaceFlinger active mode at the end of the run. rn-skia / rn-webgpu draw into their own surface, outside HWUI: `gfxinfo` counts no frame for them.\n");
  // keys: "<app>" (API 34 AVD) or "<app>@<suffix>"; grouped by suffix, then app order
  const sfx = (k) => (k.includes("@") ? k.slice(k.indexOf("@")) : "");
  const A = Object.keys(pa.apps).filter((k) => RN_APPS.includes(k.split("@")[0])).sort((x, y) => sfx(x).localeCompare(sfx(y)) || RN_APPS.indexOf(x.split("@")[0]) - RN_APPS.indexOf(y.split("@")[0]));
  const f = (x, d = 1) => (x ? (x.min === x.max ? x.median.toFixed(d) : `${x.median.toFixed(d)} (${x.min.toFixed(d)}-${x.max.toFixed(d)})`) : "-");
  const thr = (r) => { const t = r.runs?.find((x) => x.threads)?.threads; return t ? t.slice(0, 3).map((x) => `${x.thread} ${x.cpu}`).join(", ") : "-"; };
  const hz = (r) => r.runs?.map((x) => x.refreshRateAfter).filter((x) => x != null).join("/") || "-";
  out.push(table(["app", "API", "reps x s", "app CPU% (of one core)", "SurfaceFlinger CPU%", "PSS avg MB", "first frame ms", "shader setup ms", "HWUI frames / 20 s", "janky %", "HWUI p95 ms", "refresh Hz", "battery °C", "top threads CPU% (rep 1)"], A.map((a) => { const r = pa.apps[a]; return [a, r.apiLevel ?? 34, `${r.reps} x ${r.secondsPerRep}`, f(r.cpuPercentAvg), f(r.surfaceFlingerCpuPercentAvg), f(r.pssAvgMB, 0), f(r.firstFrameMs, 0), f(r.shaderSetupMs), ...(r.gfxFrames?.max === 0 ? ["0 (not HWUI)", "-", "-"] : [f(r.gfxFrames, 0), f(r.gfxJankyPercent), f(r.gfxP95Ms, 0)]), hz(r), f(r.batteryTempCBefore), thr(r)]; })));
  const ds = load("android-device-summary.json");
  if (ds) {
    h("### Android device summary (Galaxy S21 Ultra, mean of 2 runs)");
    const n = (x, d = 1) => (x == null ? "-" : x.toFixed(d));
    const rows = [];
    for (const [app, passes] of Object.entries(ds.apps)) for (const [pass, m] of Object.entries(passes)) rows.push([app, pass, `${n(m.cpu)} (${m.runs.map((r) => n(r.cpu)).join(" / ")})`, n(m.surfaceFlingerCpu), n(m.pssMB, 0), n(m.firstFrameMs, 0), m.runs.map((r) => n(r.refreshHz, 0)).join("/"), m.runs.map((r) => n(r.batteryTempC)).join("/")]);
    out.push(table(["app", "pass", "app CPU% (runs)", "SurfaceFlinger CPU%", "PSS MB", "first frame ms", "refresh Hz", "battery °C"], rows));
  }
}
const st = load("startup.json");
if (st) {
  h("## Startup: first frame and native shader setup (fresh install vs relaunch)");
  out.push("Fresh install = uninstall + install + launch (empty Metal compiler cache / EGL blob cache); relaunch = kill + launch. Median (min-max) of n launches. Shader setup = iOS Metal library + pipeline creation, Android glCompileShader + glLinkProgram.\n");
  const f = (x, d = 1) => (x ? (x.min === x.max ? x.median.toFixed(d) : `${x.median.toFixed(d)} (${x.min.toFixed(d)}-${x.max.toFixed(d)})`) : "-");
  out.push(table(["app", "platform", "n", "first frame ms (install)", "shader setup ms (install)", "first frame ms (relaunch)", "shader setup ms (relaunch)"],
    Object.entries(st.apps).map(([k, r]) => [k.replace(/@(ios|android)$/, ""), r.platform === "android" ? `Android API ${r.apiLevel}` : "iOS sim", r.n, f(r.install.firstFrameMs, 0), f(r.install.shaderSetupMs), f(r.relaunch.firstFrameMs, 0), f(r.relaunch.shaderSetupMs)])));
}
// iPhone (physical device): perf-ios-device.py (CPU / memory) and perf-ios-device-startup.py (first frame)
const jsonl = (f) => { try { return fs.readFileSync(path.join(RESULTS, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return null; } };
const ipd = jsonl("perf-ios-device.jsonl");
if (ipd) {
  h("## iOS performance (iPhone 13, iOS 26.5, Release)");
  out.push("CPU % of one core = delta of the process's CPU time / wall time between two Instruments snapshots ~30 s apart; memory = physical footprint. Mean (runs).\n");
  const by = {};
  for (const e of ipd) if (e.result && e.result.cpuPercent != null) (by[e.app] ||= []).push(e.result);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  out.push(table(["app", "runs", "app CPU % (runs)", "memory MB"], Object.entries(by).map(([app, rs]) => [app, rs.length, `${mean(rs.map((r) => r.cpuPercent)).toFixed(1)} (${rs.map((r) => r.cpuPercent.toFixed(1)).join(" / ")})`, mean(rs.map((r) => r.memFootprintMB)).toFixed(0)])));
}
const isd = jsonl("startup-ios-device.jsonl");
if (isd) {
  h("## iOS startup (iPhone 13): first frame and shader setup");
  out.push("cold = first launch after a fresh install (empty Metal cache); warm = relaunches. ms from JS start.\n");
  const v = (x) => (x == null ? "-" : String(Math.round(x * 10) / 10));
  const order = [...new Set(isd.map((e) => e.app))].sort(), rows = [];
  for (const e of [...isd].sort((x, y) => order.indexOf(x.app) - order.indexOf(y.app) || (x.pass ?? 1) - (y.pass ?? 1))) {
    const r = e.result; if (!r || !r.cold) continue;
    rows.push([e.app, e.pass ?? 1, v(r.cold.firstFrameMs), r.warm.map((w) => v(w.firstFrameMs)).join(" / "), v(r.cold.shaderSetupMs), r.warm.map((w) => v(w.shaderSetupMs)).join(" / ")]); }
  out.push(table(["app", "pass", "first frame cold", "first frame warm", "shader setup cold", "shader setup warm"], rows));
}
const igd = jsonl("gpu-ios-device.jsonl");
if (igd) {
  h("## iOS GPU and frame rate (iPhone 13, 60 Hz display)");
  out.push("perf-ios-device-gpu.py: 5 s Metal System Trace. GPU busy = union of the app's GPU intervals / time; fps = images the app presents per second (GPU work bursts for OpenGL ES); compositor = backboardd's GPU busy. Mean (runs).\n");
  const by = {};
  for (const e of igd) if (e.result && e.result.fps != null) (by[e.app] ||= []).push(e.result);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  out.push(table(["app", "runs", "fps", "GPU busy %", "GPU ms / frame", "compositor GPU busy %", "display fps"], Object.entries(by).map(([app, rs]) => [app, rs.length,
    mean(rs.map((r) => r.fps)).toFixed(1), mean(rs.map((r) => r.gpuBusyPercent)).toFixed(1), mean(rs.map((r) => r.gpuMsPerFrame)).toFixed(2),
    mean(rs.map((r) => r.compositorGpuBusyPercent)).toFixed(1), mean(rs.map((r) => r.displayFps ?? 0)).toFixed(1)])));
}
const agd = jsonl("gpu-android-device.jsonl");
if (agd) {
  h("## Android frame rate and GPU (Galaxy S21 Ultra, 60 Hz)");
  out.push("perf-android-gpu.py: fps = frames SurfaceFlinger presented for the app's busiest layer; GPU load = gpu_busy x clock / max clock. Mean (runs).\n");
  const by = {};
  for (const e of agd) if (e.gpuBusyPercent != null) (by[e.app] ||= []).push(e);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  out.push(table(["app", "runs", "fps", "vsyncs per frame", "GPU busy % (at clock)", "GPU clock MHz", "GPU load at max clock %"], Object.entries(by).map(([app, rs]) => [app, rs.length,
    rs[0].fps == null ? "-" : mean(rs.map((r) => r.fps)).toFixed(1), rs[0].vsyncsPerFrame == null ? "-" : mean(rs.map((r) => r.vsyncsPerFrame)).toFixed(1), mean(rs.map((r) => r.gpuBusyPercent)).toFixed(1),
    mean(rs.map((r) => r.gpuClockMHz)).toFixed(0), mean(rs.map((r) => r.gpuLoadAtMaxClockPercent)).toFixed(1)])));
}
console.log("# Metrics report\n" + out.join("\n"));
