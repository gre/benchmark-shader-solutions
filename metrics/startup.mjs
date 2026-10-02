#!/usr/bin/env node
// startup: first frame + native shader setup time, on fresh installs and on relaunches.
//   node startup.mjs --platform ios --app rn-native-compatible-static --app-path <X.app> [--sim es-metrics] [--n 5]
//   node startup.mjs --platform android --app rn-native-compatible-dynamic --apk <apk> [--n 5] [--key-suffix @api25]
// Per app, n times "install": uninstall + install + launch (empty shader caches: the Metal compiler cache and
// Android's EGL blob cache live in the app's data container), then n times "relaunch": kill + launch (warm caches).
// Each launch: wait 6 s, read "[effect] first frame N ms after JS start" (JS) and "[effect] shader setup N ms"
// (native: iOS Metal library + pipeline creation, Android glCompileShader + glLinkProgram) from the device log.
// The simulator / emulator must already be booted (one Android device attached). Results: results/startup.json.
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs, saveResult, sh, tryRun } from "./lib.mjs";

const args = parseArgs();
const N = +(args.n || 5);
const app = String(args.app);
const SUFFIX = args["key-suffix"] && args["key-suffix"] !== true ? String(args["key-suffix"]) : "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (a) => { a = a.filter((x) => x != null).sort((x, y) => x - y); return a.length ? { median: a[Math.floor(a.length / 2)], min: a[0], max: a.at(-1), n: a.length } : null; };
const parse = (txt) => ({
  firstFrameMs: +(txt.match(/first frame (\d+(?:\.\d+)?) ms after JS start/)?.[1] ?? NaN) || null,
  shaderSetupMs: +(txt.match(/\[effect\] shader setup (\d+(?:\.\d+)?) ms/)?.[1] ?? NaN) || null,
});

let launch;
let meta;
if (args.platform === "ios") {
  const sim = args.sim || "es-metrics";
  const appPath = String(args["app-path"]);
  const plist = (k) => sh("/usr/libexec/PlistBuddy", ["-c", `Print :${k}`, path.join(appPath, "Info.plist")]).trim();
  const bundleId = plist("CFBundleIdentifier"), exe = plist("CFBundleExecutable");
  meta = { platform: "ios", device: sim, bundleId, appPath };
  launch = async (fresh) => {
    tryRun("xcrun", ["simctl", "terminate", sim, bundleId]);
    if (fresh) { tryRun("xcrun", ["simctl", "uninstall", sim, bundleId]); sh("xcrun", ["simctl", "install", sim, appPath]); }
    await sleep(1500);
    let out = "";
    const log = spawn("xcrun", ["simctl", "spawn", sim, "log", "stream", "--style", "compact", "--level", "debug", "--predicate", `process == "${exe}"`], { stdio: ["ignore", "pipe", "ignore"] });
    log.stdout.on("data", (d) => (out += d));
    await sleep(2000);
    sh("xcrun", ["simctl", "launch", sim, bundleId]);
    await sleep(6000);
    log.kill("SIGTERM");
    return parse(out);
  };
} else {
  const ADB = path.join(process.env.ANDROID_HOME || path.join(os.homedir(), "Library/Android/sdk"), "platform-tools/adb");
  const adb = (a) => tryRun(ADB, a, { timeout: 300000 });
  const apk = String(args.apk);
  const pkgName = String(args.pkg || { "rn-native-compatible-static": "com.effectstudy.nativecompat", "rn-native-compatible-dynamic": "com.effectstudy.nativecompatdyn" }[app]);
  meta = { platform: "android", device: adb(["shell", "getprop", "ro.product.model"]).out.trim(), apiLevel: +adb(["shell", "getprop", "ro.build.version.sdk"]).out.trim(), pkg: pkgName, apk };
  launch = async (fresh) => {
    adb(["shell", "am", "force-stop", pkgName]);
    if (fresh) { adb(["uninstall", pkgName]); const r = adb(["install", apk]); if (!r.ok) throw new Error(r.out); }
    await sleep(1500);
    adb(["logcat", "-c"]);
    adb(["shell", "am", "start", "-W", "-n", `${pkgName}/.MainActivity`]);
    await sleep(6000);
    return parse(adb(["logcat", "-d"]).out);
  };
}

const runs = { install: [], relaunch: [] };
for (const kind of ["install", "relaunch"]) {
  for (let i = 1; i <= N; i++) {
    const r = await launch(kind === "install");
    runs[kind].push(r);
    console.log(`${app}${SUFFIX} ${kind} #${i}: first frame ${r.firstFrameMs ?? "n/a"} ms, shader setup ${r.shaderSetupMs ?? "n/a"} ms`);
  }
}
const agg = (rs) => ({ firstFrameMs: med(rs.map((r) => r.firstFrameMs)), shaderSetupMs: med(rs.map((r) => r.shaderSetupMs)), runs: rs });
saveResult("startup.json", `${app}${SUFFIX}@${meta.platform}`, { ...meta, n: N, install: agg(runs.install), relaunch: agg(runs.relaunch) });
