#!/usr/bin/env python3
# perf-ios-device-gpu.py <bundle-id> [--seconds 5] [--settle 5]
# GPU time and frame rate of an app on a physical iPhone, from a short "Metal System Trace".
# - gpuBusyPercent: union of the app's GPU intervals (vertex, fragment, compute) / span.
#   It is GPU time at whatever clock the GPU runs at, so compare apps, not absolute load.
# - fps: images the app presents per second (CoreAnimation present requests). OpenGL ES
#   (EAGL) does not show there: then fps counts bursts of the app's GPU work (gaps > 2 ms),
#   since one GL frame can span several command buffers.
# - compositor: the same two values for backboardd (the iOS compositor).
# - displayFps: surfaces swapped on the built-in display per second.
# The launched PID is matched exactly (all apps share the process name), and the app
# is terminated after the measurement.
import subprocess, sys, json, time, os, tempfile, argparse, collections
import xml.etree.ElementTree as ET

ap = argparse.ArgumentParser()
ap.add_argument("bundle"); ap.add_argument("--seconds", type=float, default=5)
ap.add_argument("--device", default="00008110-000E05D102A2801E"); ap.add_argument("--settle", type=float, default=5)
a = ap.parse_args()
run = lambda *c, **k: subprocess.run(list(c), capture_output=True, text=True, **k)

def table(trace, schema):
    x = run("xcrun", "xctrace", "export", "--input", trace, "--xpath",
            f'/trace-toc/run[@number="1"]/data/table[@schema="{schema}"]').stdout
    root = ET.fromstring(x)
    ids = {el.attrib["id"]: el for el in root.iter() if "id" in el.attrib}
    cols = [c.findtext("mnemonic") for c in root.iter("col")]
    for row in root.iter("row"):
        v = {}
        for n, el in zip(cols, list(row)):
            if "ref" in el.attrib: el = ids[el.attrib["ref"]]
            v[n] = el
        yield v

def gpu(trace):
    iv = collections.defaultdict(list); frames = collections.defaultdict(set)
    for v in table(trace, "metal-gpu-intervals"):
        if v.get("process") is None: continue
        p = v["process"].attrib.get("fmt") or ""; s = int(v["start"].text)
        iv[p].append((s, s + int(v["duration"].text))); frames[p].add(v["frame-number"].text)
    out = {}
    for p, L in iv.items():
        L.sort(); busy = 0; cs, ce = L[0]; bursts = 1; last = L[0][1]
        for s, e in L[1:]:
            if s > last + 2e6: bursts += 1
            last = max(last, e)
            if s > ce: busy += ce - cs; cs, ce = s, e
            else: ce = max(ce, e)
        busy += ce - cs; span = L[-1][1] - L[0][0]
        out[p] = {"gpuBusyPercent": round(100 * busy / span, 1), "gpuMs": busy / 1e6, "burstsPerS": bursts / (span / 1e9),
                  "span": round(span / 1e9, 2)}
    return out

def presents_per_s(trace, pid):
    t = [int(v["timestamp"].text) for v in table(trace, "ca-client-present-request")
         if v.get("process") is not None and (v["process"].attrib.get("fmt") or "").endswith(f"({pid})")]
    t.sort()
    return round((len(t) - 1) / ((t[-1] - t[0]) / 1e9), 1) if len(t) > 2 else 0.0

def display_fps(trace):
    n = t = 0  # whole seconds only, skipping the first one (recording start-up)
    for i, v in enumerate(table(trace, "displayed-surfaces-per-second")):
        d = int(v["duration"].text)
        if i > 0 and d >= 9e8: n += int(v["count"].text); t += d
    return round(n / (t / 1e9), 1) if t else None

jpath = os.path.join(tempfile.mkdtemp(), "launch.json")
r = run("xcrun", "devicectl", "--json-output", jpath, "device", "process", "launch", "--device", a.device, "--terminate-existing", a.bundle, timeout=120)
if r.returncode: print(json.dumps({"error": "launch failed", "out": r.stdout[-400:] + r.stderr[-400:]})); sys.exit(1)
PID = json.load(open(jpath))["result"]["process"]["processIdentifier"]
time.sleep(a.settle)
res = None
for _ in range(3):  # xctrace on device sometimes fails to save a recording: retry
    run("xcrun", "devicectl", "device", "info", "processes", "--device", a.device, timeout=60)  # wake the tunnel
    out = os.path.join(tempfile.mkdtemp(), "m.trace")
    try:  # a recording sometimes hangs: give up on it after 2 minutes and retry
        run("xcrun", "xctrace", "record", "--template", "Metal System Trace", "--device", a.device, "--all-processes",
            "--time-limit", f"{a.seconds:g}s", "--no-prompt", "--output", out, timeout=120)
        g = gpu(out); comp = next((v for p, v in g.items() if p.startswith("backboardd")), None)
        app = next((v for p, v in g.items() if p.endswith(f"({PID})")), None)
        if comp and comp["span"] >= 0.8 * a.seconds:  # some recordings on device stop early: retry those
            fps = presents_per_s(out, PID)
            if app and not fps: fps = round(app["burstsPerS"], 1)
            res = {"bundle": a.bundle, "pid": PID, "fps": fps,
                   "gpuBusyPercent": app["gpuBusyPercent"] if app else 0.0,
                   "gpuMsPerFrame": round(app["gpuMs"] / (fps * app["span"]), 2) if app and fps else 0.0,
                   "compositorGpuBusyPercent": comp["gpuBusyPercent"], "displayFps": display_fps(out)}
            break
    except Exception as e:
        print(f"retry: {e!r}", file=sys.stderr)
    time.sleep(2)
run("xcrun", "devicectl", "device", "process", "terminate", "--device", a.device, "--pid", str(PID), timeout=60)
print(json.dumps(res or {"bundle": a.bundle, "error": "no GPU intervals for the app"}))
