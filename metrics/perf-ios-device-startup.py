#!/usr/bin/env python3
# perf-ios-device-startup.py <bundle-id> --app-path X.app [--relaunches 3]
# First frame on a physical iPhone, cold (first launch after a fresh install, so the
# Metal shader cache is empty) and warm (relaunches). Reads the app's "[effect] ..."
# lines from `devicectl ... --console` (the apps mirror them to stderr in Release).
import subprocess, sys, json, re, argparse, time
ap = argparse.ArgumentParser()
ap.add_argument("bundle"); ap.add_argument("--app-path", required=True)
ap.add_argument("--relaunches", type=int, default=3); ap.add_argument("--device", default="00008110-000E05D102A2801E")
ap.add_argument("--wait", type=float, default=12)
a = ap.parse_args()
run = lambda *c, **k: subprocess.run(list(c), capture_output=True, text=True, **k)

def launch():
    try:
        p = run("xcrun", "devicectl", "device", "process", "launch", "--device", a.device,
                "--terminate-existing", "--console", a.bundle, timeout=a.wait)
        out = p.stdout + p.stderr
    except subprocess.TimeoutExpired as e:
        out = (e.stdout or b"").decode() + (e.stderr or b"").decode() if isinstance(e.stdout, bytes) else (e.stdout or "") + (e.stderr or "")
    ff = re.search(r"\[effect\] first frame (\d+(?:\.\d+)?) ms after JS start", out)
    ss = re.search(r"\[effect\] shader setup (\d+(?:\.\d+)?) ms", out)
    nf = re.search(r"\[effect\] native first frame (\d+(?:\.\d+)?) ms", out)
    return {"firstFrameMs": float(ff.group(1)) if ff else None,
            "shaderSetupMs": float(ss.group(1)) if ss else None,
            "nativeFirstFrameMs": float(nf.group(1)) if nf else None}

run("xcrun", "devicectl", "device", "uninstall", "app", "--device", a.device, a.bundle, timeout=120)
r = run("xcrun", "devicectl", "device", "install", "app", "--device", a.device, a.app_path, timeout=600)
if r.returncode: print(json.dumps({"bundle": a.bundle, "error": "install failed"})); sys.exit(1)
cold = launch()
warm = []
for _ in range(a.relaunches):
    time.sleep(2); warm.append(launch())
print(json.dumps({"bundle": a.bundle, "cold": cold, "warm": warm}))
