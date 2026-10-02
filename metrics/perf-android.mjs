#!/usr/bin/env node
// perf-android: install release APKs on the arm64 emulator AVD, sample CPU % and PSS of the app for 20 s x 3 reps,
// first frame from logcat (`ReactNativeJS` line "[effect] first frame N ms after JS start" / native onFirstFrame log).
//   node perf-android.mjs [--app rn-baseline,rn-native,rn-native-compatible-static,rn-native-compatible-dynamic] [--apk-<app> <path>] [--seconds 20] [--reps 3] [--keep-emulator] [--avd <name>]
//                         [--key-suffix @api25]   (results saved under "<app><suffix>", e.g. another AVD)
//                         [--pss-once]   PSS sampled once at the end of each run instead of every 2 s (the `dumpsys meminfo` binder work
//                                        is executed by the app process and counted in its CPU: ~5 points on the S21)
//                         [--pause 30]   seconds of pause before each app (cool-down between apps; real device)
//                         [--no-install] do not reinstall an APK whose package is already installed (real device: avoids reinstall noise)
// Real device: if a device is attached no emulator is started; battery temperature (dumpsys battery) and the display refresh rate
// (dumpsys display / SurfaceFlinger) are logged before each run.
// Per rep also: CPU % per thread name of the app (/proc/<pid>/task/*/stat, top 8) and HWUI frame stats of the app window
// (`dumpsys gfxinfo <pkg>` after a reset at the start of the sampling window: frames, janky %, p50/p90/p95/p99 ms).
// Starts the emulator (-no-snapshot-save -no-window -no-audio) itself if no device is attached and kills it at the end
// (by PID + `adb emu kill`) unless --keep-emulator. Never use while another emulator user is active.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { parseArgs, saveResult, tryRun, appDir } from "./lib.mjs";

const args = parseArgs();
const SDK = process.env.ANDROID_HOME || path.join(os.homedir(), "Library/Android/sdk");
const ADB = path.join(SDK, "platform-tools/adb");
const EMU = path.join(SDK, "emulator/emulator");
const AVD = args.avd || "Pixel_3a_API_34_extension_level_7_arm64-v8a";
const SECONDS = +(args.seconds || 20), REPS = +(args.reps || 3), SETTLE = 3;
const APPS = {
  "rn-baseline": { pkg: "com.effectstudy.baseline", activity: "com.effectstudy.baseline/.MainActivity", apk: args["apk-rn-baseline"] || path.join(appDir("rn-baseline"), "android/app/build/outputs/apk/release/app-release.apk") },
  "rn-native": { pkg: "com.effectstudy.native", activity: "com.effectstudy.native/com.effectstudy.nativeapp.MainActivity", apk: args["apk-rn-native"] || "/private/tmp/rnn-app-release-4abi.apk" },
  "rn-native-compatible-static": { pkg: "com.effectstudy.nativecompat", activity: "com.effectstudy.nativecompat/.MainActivity", apk: args["apk-rn-native-compatible-static"] || "/private/tmp/rnncs-app-release-4abi.apk" },
  "rn-native-compatible-dynamic": { pkg: "com.effectstudy.nativecompatdyn", activity: "com.effectstudy.nativecompatdyn/.MainActivity", apk: args["apk-rn-native-compatible-dynamic"] || "/private/tmp/rnncd-app-release-4abi.apk" },
  "rn-skia": { pkg: "com.effectstudy.skia", activity: "com.effectstudy.skia/.MainActivity", apk: args["apk-rn-skia"] || "/private/tmp/rn-skia-release-arm64.apk" },
  "rn-webgpu": { pkg: "com.effectstudy.webgpu", activity: "com.effectstudy.webgpu/.MainActivity", apk: args["apk-rn-webgpu"] || "/private/tmp/rn-webgpu-release-arm64.apk" },
  "rn-gl-react": { pkg: "com.effectstudy.glreact", activity: "com.effectstudy.glreact/.MainActivity", apk: args["apk-rn-gl-react"] || "/private/tmp/rn-gl-react-release-arm64.apk" },
};
const PSS_ONCE = !!args["pss-once"], PAUSE = +(args.pause || 0), NO_INSTALL = !!args["no-install"];
const SUFFIX = args["key-suffix"] && args["key-suffix"] !== true ? String(args["key-suffix"]) : "";
const want = args.app && args.app !== true ? String(args.app).split(",") : Object.keys(APPS);
const adb = (a, o = {}) => tryRun(ADB, a, o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (a) => { a = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return a.length ? { median: a[Math.floor(a.length / 2)], min: a[0], max: a.at(-1), n: a.length } : null; };

let emu = null;
function batteryTempC() { const m = adb(["shell", "dumpsys battery"]).out.match(/temperature:\s*(\d+)/); return m ? +m[1] / 10 : null; }
function refreshRate() { // SurfaceFlinger active display mode vsync rate (Hz) at that moment
  const o = adb(["shell", "dumpsys SurfaceFlinger"]).out;
  const m = o.match(/activeMode=\{[^}]*vsyncRate=([\d.]+) Hz/);
  return m ? +m[1] : null;
}
async function ensureEmulator() {
  if (/\bdevice\b/.test(adb(["devices"]).out.split("\n").slice(1).join("\n"))) return;
  emu = spawn(EMU, ["-avd", AVD, "-no-snapshot-save", "-no-window", "-no-audio", "-no-boot-anim", "-gpu", "host"], { stdio: "ignore", detached: true, env: { ...process.env, ANDROID_HOME: SDK } });
  emu.unref();
  console.log(`emulator started, pid ${emu.pid}`);
  for (let i = 0; i < 180; i++) { await sleep(2000); if (adb(["shell", "getprop", "sys.boot_completed"]).out.trim() === "1") { await sleep(5000); return; } }
  throw new Error("emulator did not boot in 6 min");
}
function procStat(pid) { // returns { cpuS (ticks/100), up }
  const r = adb(["shell", `cat /proc/uptime /proc/${pid}/stat`]);
  if (!r.ok) return null;
  const lines = r.out.split("\n");
  const up = parseFloat(lines[0]);
  const st = lines.slice(1).join(" ");
  const f = st.slice(st.lastIndexOf(")") + 2).trim().split(/\s+/);
  if (f.length < 13) return null;
  return { cpuS: (+f[11] + +f[12]) / 100, up };
}
function pss(pkg) {
  const r = adb(["shell", `dumpsys meminfo ${pkg}`]);
  const m = r.out.match(/TOTAL PSS:\s+(\d+)/) || r.out.match(/^\s*TOTAL\s+(\d+)/m);
  return m ? +m[1] / 1024 : null;
}
const pid = (pkg) => adb(["shell", `pidof ${pkg}`]).out.trim().split(/\s+/)[0];
/** cumulative CPU seconds per thread name ("comm") of a process */
function threadTimes(p) {
  const r = adb(["shell", `cat /proc/uptime; for f in /proc/${p}/task/*/stat; do cat $f; echo; done`]);
  if (!r.ok) return null;
  const lines = r.out.split("\n").filter((l) => l.trim());
  const up = parseFloat(lines[0]);
  const byName = {};
  for (const l of lines.slice(1)) {
    const a = l.indexOf("("), b = l.lastIndexOf(")");
    if (a < 0 || b < 0) continue;
    const name = l.slice(a + 1, b).replace(/[-:]?\d+$/, "").trim() || "?"; // pooled threads (e.g. "hwuiTask1") merged by name
    const f = l.slice(b + 2).trim().split(/\s+/);
    byName[name] = (byName[name] || 0) + (+f[11] + +f[12]) / 100;
  }
  return { up, byName };
}
function gfxinfo(pkg) {
  const o = adb(["shell", `dumpsys gfxinfo ${pkg}`]).out;
  const n = (re) => { const m = o.match(re); return m ? +m[1] : null; };
  return { frames: n(/Total frames rendered:\s*(\d+)/), jankyPercent: n(/Janky frames:\s*\d+\s*\(([\d.]+)%\)/), p50Ms: n(/50th percentile:\s*(\d+)ms/), p90Ms: n(/90th percentile:\s*(\d+)ms/), p95Ms: n(/95th percentile:\s*(\d+)ms/), p99Ms: n(/99th percentile:\s*(\d+)ms/) };
}

try {
  await ensureEmulator();
  const model = adb(["shell", "getprop ro.product.model"]).out.trim(), isEmu = adb(["shell", "getprop ro.kernel.qemu"]).out.trim() === "1" || emu != null;
  console.log("device:", adb(["shell", "getprop ro.product.model; getprop ro.build.version.sdk; getprop ro.product.cpu.abi"]).out.trim().replace(/\n/g, " | "));
  for (const app of want) {
    const cfg = APPS[app];
    if (!cfg) { console.log(`skip ${app}`); continue; }
    if (!fs.existsSync(cfg.apk)) { console.log(`skip ${app}: ${cfg.apk} missing`); continue; }
    if (PAUSE) { console.log(`   pause ${PAUSE} s`); await sleep(PAUSE * 1000); }
    console.log(`\n[${app}] ${cfg.apk}`);
    const installed = adb(["shell", `pm path ${cfg.pkg}`]).out.includes("package:");
    const inst = NO_INSTALL && installed ? { ok: true } : adb(["install", "-r", "-d", cfg.apk], { timeout: 300000 });
    if (!inst.ok) { console.log("   install failed: " + inst.out.slice(-300)); continue; }
    const sf = pid("surfaceflinger");
    const runs = [];
    for (let rep = 1; rep <= REPS; rep++) {
      adb(["shell", `am force-stop ${cfg.pkg}`]);
      await sleep(1500);
      const batteryTempCBefore = batteryTempC(), refreshRateBefore = refreshRate();
      adb(["logcat", "-c"]);
      const st = adb(["shell", `am start -W -n ${cfg.activity}`]);
      const totalTime = (st.out.match(/TotalTime:\s*(\d+)/) || [])[1];
      await sleep(SETTLE * 1000);
      const p = pid(cfg.pkg);
      if (!p) { console.log("   no pid (app crashed?) " + st.out.slice(-200)); break; }
      adb(["shell", `dumpsys gfxinfo ${cfg.pkg} reset`]);
      const th0 = threadTimes(p);
      let prev = procStat(p), sprev = sf ? procStat(sf) : null;
      const cpu = [], sfcpu = [], mem = [];
      for (let i = 0; i < SECONDS; i++) {
        await sleep(!PSS_ONCE && i % 4 === 0 ? 500 : 1000); // dumpsys takes ~0.5 s: keep ~1 s cadence
        const cur = procStat(p);
        if (!cur || !prev) { console.log("   process died"); break; }
        cpu.push(100 * (cur.cpuS - prev.cpuS) / (cur.up - prev.up)); prev = cur;
        if (sf && sprev) { const s = procStat(sf); if (s) { sfcpu.push(100 * (s.cpuS - sprev.cpuS) / (s.up - sprev.up)); sprev = s; } }
        if (!PSS_ONCE && i % 2 === 0) { const m = pss(cfg.pkg); if (m) mem.push(m); }
      }
      const th1 = threadTimes(p);
      if (PSS_ONCE) { const m = pss(cfg.pkg); if (m) mem.push(m); } // after the CPU window: not counted in it
      const gfx = gfxinfo(cfg.pkg);
      const threads = th0 && th1 ? Object.entries(th1.byName).map(([n, c]) => [n, 100 * (c - (th0.byName[n] || 0)) / (th1.up - th0.up)]).filter(([, c]) => c > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => ({ thread: n, cpu: +c.toFixed(2) })) : null;
      const log = adb(["logcat", "-d", "-s", "ReactNativeJS:*", "SilkView:*", "*:S"]).out + adb(["logcat", "-d"]).out;
      const ff = log.match(/first frame (\d+(?:\.\d+)?) ms after JS start/);
      const ss = log.match(/\[effect\] shader setup (\d+(?:\.\d+)?) ms/); // rn-native-compatible-*: glCompileShader + glLinkProgram
      const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
      const refreshRateAfter = refreshRate();
      const run = { rep, batteryTempCBefore, refreshRateBefore, refreshRateAfter, amStartTotalTimeMs: totalTime ? +totalTime : null, firstFrameMs: ff ? +ff[1] : null, shaderSetupMs: ss ? +ss[1] : null, cpuAvg: avg(cpu), surfaceFlingerCpuAvg: avg(sfcpu), pssAvgMB: avg(mem), pssMaxMB: mem.length ? Math.max(...mem) : null, samples: cpu.length, threads, gfxinfo: gfx };
      runs.push(run);
      console.log(`   #${rep} battery ${batteryTempCBefore} °C | display ${refreshRateBefore} Hz before, ${refreshRateAfter} Hz at the end`);
      console.log(`   #${rep} CPU ${run.cpuAvg?.toFixed(1)}% | SurfaceFlinger ${run.surfaceFlingerCpuAvg?.toFixed(1)}% | PSS avg ${run.pssAvgMB?.toFixed(0)} MB max ${run.pssMaxMB?.toFixed(0)} | first frame ${run.firstFrameMs ?? "n/a"} ms | shader setup ${run.shaderSetupMs ?? "n/a"} ms | am start TotalTime ${totalTime} ms`);
      if (threads) console.log(`      threads: ${threads.map((t) => `${t.thread} ${t.cpu}%`).join(", ")}`);
      console.log(`      gfxinfo: ${JSON.stringify(gfx)}`);
    }
    adb(["shell", `am force-stop ${cfg.pkg}`]);
    if (!runs.length) continue;
    const sdk = adb(["shell", "getprop ro.build.version.sdk"]).out.trim();
    saveResult("perf-android.json", app + SUFFIX, {
      device: isEmu ? `AVD ${AVD}` : model, apiLevel: +sdk || null, apk: cfg.apk, reps: runs.length, secondsPerRep: SECONDS,
      cpuPercentAvg: med(runs.map((r) => r.cpuAvg)), pssAvgMB: med(runs.map((r) => r.pssAvgMB)), pssMaxMB: med(runs.map((r) => r.pssMaxMB)),
      firstFrameMs: med(runs.map((r) => r.firstFrameMs)), shaderSetupMs: med(runs.map((r) => r.shaderSetupMs)), gfxFrames: med(runs.map((r) => r.gfxinfo?.frames)), gfxJankyPercent: med(runs.map((r) => r.gfxinfo?.jankyPercent)), gfxP95Ms: med(runs.map((r) => r.gfxinfo?.p95Ms)), amStartTotalTimeMs: med(runs.map((r) => r.amStartTotalTimeMs)), surfaceFlingerCpuPercentAvg: med(runs.map((r) => r.surfaceFlingerCpuAvg)),
      pssOnce: PSS_ONCE, batteryTempCBefore: med(runs.map((r) => r.batteryTempCBefore)),
      note: isEmu ? "emulator (host GPU) on Apple M1 Pro, not a device; CPU % of one core from /proc/<pid>/stat" : `real device ${model}; CPU % of one core from /proc/<pid>/stat${PSS_ONCE ? "; PSS read once after the CPU window" : "; PSS polled every 2 s (in the CPU window)"}`,
      runs,
    });
  }
} finally {
  if (!args["keep-emulator"] && emu) { adb(["emu", "kill"]); { await sleep(3000); try { process.kill(emu.pid, "SIGTERM"); } catch {} } }
}
