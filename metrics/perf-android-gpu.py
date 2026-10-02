#!/usr/bin/env python3
# perf-android-gpu.py <app> [<app> ...] [--seconds 10] [--settle 5] [--hz 60]
# Frame rate and GPU load of our apps on a physical Android phone (no root).
# - fps per layer: frames SurfaceFlinger actually presented for each of the app's layers
#   (`dumpsys SurfaceFlinger --latency`). It sees every layer, including the SurfaceViews
#   that RN Skia and RN WebGPU draw into, which `dumpsys gfxinfo` does not.
# - gpuBusyPercent: device-wide GPU utilization from sysfs (/sys/kernel/gpu/gpu_busy on
#   Samsung), sampled every second. It is relative to the current GPU clock, which the
#   governor lowers when there is little work, so gpuLoadAtMaxClockPercent scales it:
#   busy x clock / max clock (/sys/kernel/gpu/gpu_clock, gpu_max_clock). With only our app
#   on screen, it is the effect's load plus composition.
# - vsyncsPerFrame: median gap between presented frames, in display refresh periods.
# The display is held at --hz (Samsung `refresh_rate_mode`, restored to adaptive at the end).
import subprocess, sys, json, time, argparse, re

APPS = {
    "rn-baseline": ("com.effectstudy.baseline", "com.effectstudy.baseline/.MainActivity"),
    "rn-native": ("com.effectstudy.native", "com.effectstudy.native/com.effectstudy.nativeapp.MainActivity"),
    "rn-native-compatible-static": ("com.effectstudy.nativecompat", "com.effectstudy.nativecompat/.MainActivity"),
    "rn-native-compatible-dynamic": ("com.effectstudy.nativecompatdyn", "com.effectstudy.nativecompatdyn/.MainActivity"),
    "rn-skia": ("com.effectstudy.skia", "com.effectstudy.skia/.MainActivity"),
    "rn-webgpu": ("com.effectstudy.webgpu", "com.effectstudy.webgpu/.MainActivity"),
    "rn-gl-react": ("com.effectstudy.glreact", "com.effectstudy.glreact/.MainActivity"),
}
ap = argparse.ArgumentParser()
ap.add_argument("apps", nargs="*", default=list(APPS)); ap.add_argument("--seconds", type=float, default=10)
ap.add_argument("--settle", type=float, default=5); ap.add_argument("--hz", type=int, default=60)
a = ap.parse_args()
sh = lambda c: subprocess.run(["adb", "shell", c], capture_output=True, text=True).stdout

GPU_FILES = ["/sys/kernel/gpu/gpu_busy", "/sys/class/kgsl/kgsl-3d0/gpu_busy_percentage", "/sys/class/misc/mali0/device/utilization"]
gpu_file = next((f for f in GPU_FILES if re.search(r"\d", sh(f"cat {f} 2>/dev/null"))), None)
def gpu_busy():  # (busy %, clock kHz or None)
    if not gpu_file: return None
    o = sh(f"cat {gpu_file}; cat /sys/kernel/gpu/gpu_clock 2>/dev/null")
    n = [int(x) for x in re.findall(r"\d+", o)]
    return (n[0], n[1] if len(n) > 1 else None) if n else None
max_clock = int((re.findall(r"\d+", sh("cat /sys/kernel/gpu/gpu_max_clock 2>/dev/null")) or [0])[0]) or None

def layers(pkg):
    # Android 15 prints "RequestedLayerState{<name> parentId=... z=...}": keep <name>
    out = []
    for l in sh("dumpsys SurfaceFlinger --list").splitlines():
        m = re.match(r"\s*RequestedLayerState\{(.*?)(?: parentId=| relativeParentId=| z=|\}$)", l)
        name = m.group(1) if m else l.strip()
        if pkg in name: out.append(name)
    return out

def fps(layer):
    # --latency: refresh period, then "desired actual-present frame-ready" (ns) for the
    # layer's last ~128 frames (~2 s at 60 Hz)
    lines = sh(f"dumpsys SurfaceFlinger --latency '{layer}'").splitlines()
    period = int(lines[0]) if lines and lines[0].strip().isdigit() else None
    t = sorted(int(r[1]) for r in (l.split() for l in lines[1:]) if len(r) == 3 and 0 < int(r[1]) < 2**62)
    if len(t) <= 2: return 0.0, None
    gaps = sorted(b - a for a, b in zip(t, t[1:]))
    return round((len(t) - 1) / ((t[-1] - t[0]) / 1e9), 1), round(gaps[len(gaps) // 2] / period, 2) if period else None

mode = {60: "0", 120: "2"}.get(a.hz)
if mode: sh(f"settings put secure refresh_rate_mode {mode}")
try:
    for app in a.apps:
        pkg, act = APPS[app]
        sh("input keyevent KEYCODE_WAKEUP"); sh(f"am start -W -n {act}"); time.sleep(a.settle)
        g = []
        for _ in range(int(a.seconds)): time.sleep(1); g.append(gpu_busy())
        per = {l: fps(l) for l in layers(pkg)}
        top = max(per.values(), default=(None, None))
        g = [x for x in g if x is not None]
        busy = round(sum(b for b, _ in g) / len(g), 1) if g else None
        at_max = round(sum(b * c for b, c in g) / len(g) / max_clock, 1) if g and max_clock and all(c is not None for _, c in g) else None
        print(json.dumps({"app": app, "hz": a.hz, "fps": top[0], "vsyncsPerFrame": top[1], "layers": {k: v[0] for k, v in per.items()},
                          "gpuBusyPercent": busy, "gpuClockMHz": round(sum(c for _, c in g) / len(g) / 1000) if g and g[0][1] is not None else None,
                          "gpuLoadAtMaxClockPercent": at_max, "gpuFile": gpu_file}), flush=True)
        sh(f"am force-stop {pkg}")
finally:
    if mode: sh("settings put secure refresh_rate_mode 1")
