#!/usr/bin/env python3
# perf-ios-device.py <bundle-id> [--app-path X.app] [--seconds 20] [--process RnBaseline]
# CPU % (of one core) and memory footprint of an app on a physical iPhone.
# xctrace recordings on device stop after ~1 s, so we take two short "Activity Monitor"
# snapshots N seconds apart: each gives the process's cumulative CPU time (user + system);
# CPU % = delta CPU time / delta wall time (same method as /proc on Android).
# The launched PID is matched exactly (all apps share the process name), and the app
# is terminated after the measurement.
import subprocess, sys, json, time, os, tempfile, argparse, re, datetime
import xml.etree.ElementTree as ET

ap = argparse.ArgumentParser()
ap.add_argument("bundle"); ap.add_argument("--app-path"); ap.add_argument("--seconds", type=float, default=20)
ap.add_argument("--process", default="RnBaseline"); ap.add_argument("--device", default="00008110-000E05D102A2801E")
ap.add_argument("--settle", type=float, default=5)
a = ap.parse_args()
run = lambda *c, **k: subprocess.run(list(c), capture_output=True, text=True, **k)

def snapshot_once():
    # the developer tunnel to the device closes when idle, and xctrace then waits for the
    # device "to boot": any devicectl call reopens it
    run("xcrun", "devicectl", "device", "info", "processes", "--device", a.device, timeout=60)
    d = tempfile.mkdtemp(); out = os.path.join(d, "s.trace")
    run("xcrun", "xctrace", "record", "--template", "Activity Monitor", "--device", a.device,
        "--time-limit", "1s", "--all-processes", "--output", out, timeout=120)
    toc = run("xcrun", "xctrace", "export", "--input", out, "--toc").stdout
    start = datetime.datetime.fromisoformat(re.search(r"<start-date>([^<]+)", toc).group(1))
    x = run("xcrun", "xctrace", "export", "--input", out, "--xpath",
            '/trace-toc/run[@number="1"]/data/table[@schema="sysmon-process"]').stdout
    root = ET.fromstring(x)
    ids = {el.attrib["id"]: el for el in root.iter() if "id" in el.attrib}
    cols = [c.findtext("mnemonic") for c in root.iter("col")]
    best = None
    for row in root.iter("row"):
        v = {}
        for name, el in zip(cols, list(row)):
            if "ref" in el.attrib: el = ids[el.attrib["ref"]]
            v[name] = el
        p = v.get("process")
        if p is None or not (p.attrib.get("fmt") or "").endswith(f"({PID})"): continue
        t = int(v["time"].text); cpu = int(v["cpu-total-user"].text) + int(v["cpu-total-system"].text)
        mem = int(v["memory-physical-footprint"].text) if v.get("memory-physical-footprint") is not None and v["memory-physical-footprint"].text else None
        best = (start.timestamp() * 1e9 + t, cpu, mem, p.attrib.get("fmt"))
    return best

def snapshot():
    for _ in range(3):  # xctrace on device sometimes fails to save a recording: retry
        try:
            r = snapshot_once()
            if r: return r
        except Exception as e:
            print(f"snapshot retry: {e!r}", file=sys.stderr)
        time.sleep(2)
    return None

if a.app_path:
    r = run("xcrun", "devicectl", "device", "install", "app", "--device", a.device, a.app_path, timeout=600)
    if r.returncode: print(json.dumps({"error": "install failed", "out": r.stdout[-400:] + r.stderr[-400:]})); sys.exit(1)
jpath = os.path.join(tempfile.mkdtemp(), "launch.json")
r = run("xcrun", "devicectl", "--json-output", jpath, "device", "process", "launch", "--device", a.device, "--terminate-existing", a.bundle, timeout=120)
if r.returncode: print(json.dumps({"error": "launch failed", "out": r.stdout[-400:] + r.stderr[-400:]})); sys.exit(1)
# all our apps share the process name "RnBaseline": match the exact PID we launched
PID = json.load(open(jpath))["result"]["process"]["processIdentifier"]
time.sleep(a.settle)
s0 = snapshot(); time.sleep(a.seconds); s1 = snapshot()
if not s0 or not s1: print(json.dumps({"error": "process not found in snapshots"})); sys.exit(1)
if s0[3] != s1[3]: print(json.dumps({"error": "process restarted", "a": s0[3], "b": s1[3]})); sys.exit(1)
run("xcrun", "devicectl", "device", "process", "terminate", "--device", a.device, "--pid", str(PID), timeout=60)
dt = (s1[0] - s0[0]) / 1e9
print(json.dumps({"bundle": a.bundle, "process": s1[3], "seconds": round(dt, 1),
                  "cpuPercent": round(100 * (s1[1] - s0[1]) / (s1[0] - s0[0]), 1),
                  "memFootprintMB": round(s1[2] / 1e6, 1) if s1[2] else None}))
