#!/usr/bin/env node
// perf-ios: launch an installed Release build on a dedicated simulator and sample CPU % / RSS of the app process.
//   node perf-ios.mjs --app rn-baseline [--derived-data <path> | --app-path <X.app>] [--sim es-metrics] [--seconds 20]
//                     [--settle 3] [--no-install] [--reps 3] [--key-suffix @launch5]   (results saved under "<app><suffix>")
// The simulator `es-metrics` is created if missing (iPhone 18 Pro, iOS 27.0) and booted. Nothing else is touched.
//
// How it measures: the app is a HOST process (path inside CoreSimulator/Devices/<UDID>/...). We find its pid from
// `simctl launch`, then once per second read `ps -o rss=,time= -p <pid>`; CPU % = delta(cumulative CPU time)/delta(wall)
// (% of ONE core, can exceed 100). Also sampled: the other simulated processes of the device (children of its launchd_sim whose
// name matches backboardd|SpringBoard|MTL|Render|Graphics: compositing) as `otherDeviceCpuPercent`, and host-side Metal bridge processes (MTLSimDriverHost, shared
// between devices) as `hostGpuBridgeCpuPercent` when present.
// First frame: `log stream` on the simulator for the line "[effect] first frame N ms after JS start" (JS console.log
// + the native line "[effect] shader setup N ms" (rn-native-compatible-*: Metal library + pipeline creation)
// is forwarded to os_log in RN 0.87; see notes in README if the line is absent).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { RN_APPS, parseArgs, selectApps, saveResult, sh, tryRun, appDir } from "./lib.mjs";

const args = parseArgs();
const SIM = args.sim || "es-metrics";
const SECONDS = +(args.seconds || 20);
const SETTLE = +(args.settle || 3);
const REPS = +(args.reps || 3);
const SUFFIX = args["key-suffix"] && args["key-suffix"] !== true ? String(args["key-suffix"]) : "";
const NOTES = { "rn-skia": "renders at 3x (1206x2622 px)", "rn-gl-react": "renders at 3x; software GLES on the simulator draws ~1 frame/33 s (not representative)", "rn-webgpu": "pixel ratio capped at 2", "rn-baseline": "no effect (solid colour)", "rn-native": "Metal (CAMetalLayer), pixel ratio capped at 2", "rn-native-compatible-static": "Metal (CAMetalLayer), pixel ratio capped at 2; metallib compiled at build time (same iOS code as rn-native)", "rn-native-compatible-dynamic": "Metal (CAMetalLayer), pixel ratio capped at 2; MSL source from JS compiled at runtime" };
const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-27-0";

function ensureSim() {
  const list = JSON.parse(sh("xcrun", ["simctl", "list", "devices", "-j"])).devices;
  for (const ds of Object.values(list)) for (const d of ds) if (d.name === SIM) { if (d.state !== "Booted") sh("xcrun", ["simctl", "boot", d.udid]); return d.udid; }
  const udid = sh("xcrun", ["simctl", "create", SIM, "iPhone 18 Pro", RUNTIME]).trim();
  sh("xcrun", ["simctl", "boot", udid]);
  sh("xcrun", ["simctl", "bootstatus", udid, "-b"], { timeout: 180000 });
  return udid;
}
function parseTime(t) { // [[dd-]hh:]mm:ss.xx
  const m = t.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return NaN;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+m[3]) * 60 + +m[4];
}
function psSample(pid) {
  const r = tryRun("ps", ["-o", "rss=,time=", "-p", String(pid)]);
  if (!r.ok) return null;
  const [rss, time] = r.out.trim().split(/\s+/);
  return { rssKB: +rss, cpuS: parseTime(time), wall: Date.now() / 1000 };
}
/** All simulated processes of the device (children of its launchd_sim), excluding the app: SpringBoard, backboardd (compositing), etc. */
function devicePids(udid, appPid) {
  const r = tryRun("ps", ["-axo", "pid=,ppid=,comm="]);
  const rows = r.out.split("\n").map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], comm: m[3] }));
  const ls = tryRun("ps", ["-axo", "pid=,command="]).out.split("\n").find((l) => l.includes("launchd_sim") && l.includes(udid));
  if (!ls) return [];
  const root = +ls.trim().split(/\s+/)[0];
  return rows.filter((x) => x.ppid === root && x.pid !== appPid && /backboardd|SpringBoard|MTL|Render|Graphics/i.test(path.basename(x.comm))).map((x) => ({ pid: x.pid, name: path.basename(x.comm) }));
}
function hostGpuPids() {
  return tryRun("ps", ["-axo", "pid=,comm="]).out.split("\n").map((l) => l.trim().match(/^(\d+)\s+(.*)$/)).filter((m) => m && /MTLSimDriverHost|MTLSimulator/.test(m[2])).map((m) => +m[1]);
}
const stats = (a) => { const s = [...a].sort((x, y) => x - y); const avg = a.reduce((x, y) => x + y, 0) / a.length; return { avg, p95: s[Math.min(s.length - 1, Math.floor(0.95 * s.length))], max: s.at(-1), min: s[0] }; };

const apps = selectApps(args, RN_APPS);
if (!apps.length) { console.log("no app (use --app rn-baseline)"); process.exit(0); }
for (const app of apps) {
  console.log(`\n[${app}]`);
  let appPath = args["app-path"];
  const dd = args["derived-data"];
  if (!appPath && dd) { const rel = path.join(dd, "Build/Products/Release-iphonesimulator"); if (fs.existsSync(rel)) { const a = fs.readdirSync(rel).find((f) => f.endsWith(".app")); if (a) appPath = path.join(rel, a); } }
  if (!appPath) { console.log("   skipped: pass --derived-data <dd of a Release sim build> or --app-path <X.app>"); continue; }
  const udid = ensureSim();
  const plist = tryRun("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", path.join(appPath, "Info.plist")]);
  const bundleId = plist.out.trim();
  const exe = tryRun("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleExecutable", path.join(appPath, "Info.plist")]).out.trim();
  try { sh("xcrun", ["simctl", "terminate", udid, bundleId]); } catch {}
  if (!args["no-install"]) sh("xcrun", ["simctl", "install", udid, appPath]);

  const runs = [];
  for (let rep = 1; rep <= REPS; rep++) {
  // log stream for the first-frame line (started before launch)
  const logLines = [];
  const log = spawn("xcrun", ["simctl", "spawn", udid, "log", "stream", "--style", "compact", "--level", "debug", "--predicate", `process == "${exe}"`], { stdio: ["ignore", "pipe", "ignore"] });
  log.stdout.on("data", (d) => logLines.push(...String(d).split("\n")));
  await new Promise((r) => setTimeout(r, 1500));

  const launched = sh("xcrun", ["simctl", "launch", udid, bundleId]).trim(); // "<bundle>: <pid>"
  const pid = +launched.split(":").pop();
  const tLaunch = Date.now();
  console.log(`   ${launched} on ${SIM} (${udid})`);
  await new Promise((r) => setTimeout(r, SETTLE * 1000));
  const hostG = hostGpuPids(); const hprev = Object.fromEntries(hostG.map((p) => [p, psSample(p)])); const hcpu = [];
  const dev = devicePids(udid, pid); const gpuPids = dev.map((d) => d.pid);
  const series = [];
  let prev = psSample(pid); const gprev = Object.fromEntries(gpuPids.map((p) => [p, psSample(p)]));
  const cpu = [], rss = [], gcpu = [];
  for (let i = 0; i < SECONDS; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const cur = psSample(pid);
    if (!cur || !prev) { console.log("   process died during sampling"); break; }
    const c = 100 * (cur.cpuS - prev.cpuS) / (cur.wall - prev.wall);
    cpu.push(c); rss.push(cur.rssKB * 1024);
    let g = 0;
    for (const p of gpuPids) { const s = psSample(p); if (s && gprev[p]) { g += 100 * (s.cpuS - gprev[p].cpuS) / (s.wall - gprev[p].wall); gprev[p] = s; } }
    gcpu.push(g);
    let hg = 0;
    for (const p of hostG) { const x = psSample(p); if (x && hprev[p]) { hg += 100 * (x.cpuS - hprev[p].cpuS) / (x.wall - hprev[p].wall); hprev[p] = x; } }
    hcpu.push(hg);
    series.push({ t: i + 1, cpu: +c.toFixed(1), rssMB: +(cur.rssKB / 1024).toFixed(1) });
    prev = cur;
  }
  log.kill("SIGTERM");
  const ff = logLines.map((l) => l.match(/first frame (\d+(?:\.\d+)?) ms after JS start/)).find(Boolean);
  const ss = logLines.map((l) => l.match(/\[effect\] shader setup (\d+(?:\.\d+)?) ms/)).find(Boolean);
  const entry = {
    device: SIM, udid, bundleId, pid, appPath, seconds: series.length, samples: series.length,
    cpuPercent: cpu.length ? stats(cpu) : null, rssBytes: rss.length ? { avg: rss.reduce((a, b) => a + b, 0) / rss.length, max: Math.max(...rss) } : null,
    hostGpuBridgeProcs: hostG.length, hostGpuBridgeCpuPercent: hcpu.length && hostG.length ? stats(hcpu) : null, otherDeviceProcesses: dev.map((d) => d.name), otherDeviceCpuPercent: gcpu.length && gpuPids.length ? stats(gcpu) : null,
    firstFrameMs: ff ? +ff[1] : null, shaderSetupMs: ss ? +ss[1] : null,
    logLinesSeen: logLines.filter(Boolean).length,
    series,
    notes: ff ? "" : "first-frame log line not captured (see README: propose machine-readable log)",
  };
  runs.push(entry);
  console.log(`   #${rep} CPU avg ${entry.cpuPercent?.avg.toFixed(1)}% p95 ${entry.cpuPercent?.p95.toFixed(1)}% (of one core) | RSS avg ${(entry.rssBytes?.avg / 1e6).toFixed(0)} MB max ${(entry.rssBytes?.max / 1e6).toFixed(0)} MB | other simulated procs ${gpuPids.length} CPU avg ${entry.otherDeviceCpuPercent?.avg.toFixed(1) ?? "-"}% | host GPU bridge ${hostG.length} procs CPU avg ${entry.hostGpuBridgeCpuPercent?.avg.toFixed(1) ?? "-"}% | first frame ${entry.firstFrameMs ?? "n/a"} ms | shader setup ${entry.shaderSetupMs ?? "n/a"} ms | log lines ${entry.logLinesSeen}`);
  try { sh("xcrun", ["simctl", "terminate", udid, bundleId]); } catch {}
  await new Promise((r) => setTimeout(r, 2000));
  }
  const med = (a) => { a = a.filter((x) => x != null).sort((x, y) => x - y); return a.length ? { median: a[Math.floor(a.length / 2)], min: a[0], max: a.at(-1), n: a.length } : null; };
  const agg = {
    device: SIM, bundleId: runs[0].bundleId, appPath, reps: runs.length, secondsPerRep: SECONDS,
    cpuPercentAvg: med(runs.map((r) => r.cpuPercent?.avg)), rssAvgBytes: med(runs.map((r) => r.rssBytes?.avg)), rssMaxBytes: med(runs.map((r) => r.rssBytes?.max)),
    firstFrameMs: med(runs.map((r) => r.firstFrameMs)), shaderSetupMs: med(runs.map((r) => r.shaderSetupMs)), otherDeviceCpuPercentAvg: med(runs.map((r) => r.otherDeviceCpuPercent?.avg)),
    note: NOTES[app] || "", runs: runs.map(({ series, ...r }) => r), series: runs[0].series,
  };
  saveResult("perf-ios.json", app + SUFFIX, agg);
}
