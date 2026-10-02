#!/usr/bin/env node
// android-device-summary: compact summary of the real-device runs of perf-android.json (Galaxy S21 Ultra keys "<app>@s21-*").
// Per app and pass: mean of the runs for app CPU %, SurfaceFlinger CPU %, PSS, first frame (+ shader setup, HWUI frames),
// and the per-run values (with battery temperature before the run and the display refresh rate at the end).
//   node android-device-summary.mjs   -> results/android-device-summary.json
import fs from "node:fs";
import path from "node:path";
import { readJSON, RESULTS, RN_APPS } from "./lib.mjs";

const PASSES = {
  "adaptive (48-120 Hz)": ["@s21-a1", "@s21-a2"],
  "60 Hz locked": ["@s21-60hz-1", "@s21-60hz-2"],
  "first pass (PSS polled, adaptive)": ["@s21-r1", "@s21-r2"],
};
const pa = readJSON(path.join(RESULTS, "perf-android.json")).apps;
const mean = (a) => { a = a.filter((x) => x != null); return a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null; };
const r2 = (x) => (x == null ? null : +x.toFixed(2));
const apps = {};
for (const app of RN_APPS) {
  for (const [pass, keys] of Object.entries(PASSES)) {
    const runs = keys.map((k) => pa[app + k]?.runs?.[0] && { key: app + k, ...pa[app + k].runs[0] }).filter(Boolean);
    if (!runs.length) continue;
    const per = runs.map((r) => ({
      key: r.key, cpu: r2(r.cpuAvg), surfaceFlingerCpu: r2(r.surfaceFlingerCpuAvg), pssMB: r2(r.pssAvgMB), firstFrameMs: r.firstFrameMs, shaderSetupMs: r.shaderSetupMs,
      hwuiFrames: r.gfxinfo?.frames ?? null, refreshHz: r.refreshRateAfter ?? null, batteryTempC: r.batteryTempCBefore ?? null,
      topThreads: r.threads?.slice(0, 5) ?? null,
    }));
    (apps[app] ||= {})[pass] = {
      n: per.length, cpu: mean(per.map((r) => r.cpu)), surfaceFlingerCpu: mean(per.map((r) => r.surfaceFlingerCpu)), pssMB: mean(per.map((r) => r.pssMB)),
      firstFrameMs: mean(per.map((r) => r.firstFrameMs)), shaderSetupMs: mean(per.map((r) => r.shaderSetupMs)), hwuiFrames: mean(per.map((r) => r.hwuiFrames)), runs: per,
    };
  }
}
const out = {
  generatedAt: new Date().toISOString(),
  device: "Samsung Galaxy S21 Ultra (SM-G998B, Exynos 2100 / Mali-G78, Android 15 / API 35), display 1080x2400",
  method: "perf-android.mjs, release APKs, 1 run of 20 s per key, runs interleaved (run 1 in app order, run 2 in reverse), 10 s pause between apps. CPU % of one core. 'first pass' PSS was polled every 2 s inside the CPU window (~5 points of binder overhead); the other passes use --pss-once.",
  apps,
};
fs.writeFileSync(path.join(RESULTS, "android-device-summary.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(Object.fromEntries(Object.entries(apps).map(([a, p]) => [a, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, `cpu ${v.cpu} sf ${v.surfaceFlingerCpu} pss ${v.pssMB} ff ${v.firstFrameMs}`]))])), null, 1));
