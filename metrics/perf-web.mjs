#!/usr/bin/env node
// perf-web: production build (temp copy) served by `vite preview` on ports 5180-5189, measured in HEADED Chromium
// with hardware GPU flags. Usage: node perf-web.mjs [--app a,b] [--reuse-build] [--seconds 10] [--ttff-runs 3]
//
// Viewports: DPR 1 at 1280x800 and at 2560x1600 (backing store = viewport, 1.0 Mpx / 4.1 Mpx). Chosen over DPR 2 at
// 1280x800 because the apps cap DPR at 2 and a DPR-1 viewport removes any browser scaling variable; 2560x1600@1 has the
// same pixel count as 1280x800@2 (a typical Retina laptop).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { WEB_APPS, parseArgs, selectApps, saveResult, saveWhole, machine } from "./lib.mjs";
import { buildWeb } from "./build-web.mjs";

const args = parseArgs();
const SECONDS = +(args.seconds || 10);
const TTFF_RUNS = +(args["ttff-runs"] || 3);
const VIEWPORTS = [{ w: 1280, h: 800 }, { w: 2560, h: 1600 }];
const GPU_ARGS = ["--enable-unsafe-webgpu", "--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=metal"];
const PORT0 = 5180;
const REPS = +(args.reps || 3);

const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const avg = a.reduce((x, y) => x + y, 0) / a.length;
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: a.length, avg, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s.at(-1), fpsAvg: 1000 / avg };
};
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

// in-page: after the first frame, record rAF deltas for SECONDS
const SAMPLER = `(secs) => new Promise((res) => {
  const d = []; let last = performance.now(); const t0 = last;
  const f = (t) => { d.push(t - last); last = t; if (t - t0 < secs * 1000) requestAnimationFrame(f); else res({ d, heap: performance.memory ? performance.memory.usedJSHeapSize : null }); };
  requestAnimationFrame(f);
})`;

async function renderers(page) {
  return page.evaluate(async () => {
    const out = {};
    try {
      const c = document.createElement("canvas"); const gl = c.getContext("webgl");
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      out.webgl = ext ? { vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) } : { renderer: gl.getParameter(gl.RENDERER) };
    } catch (e) { out.webgl = { error: String(e) }; }
    try {
      const a = await navigator.gpu?.requestAdapter();
      out.webgpu = a ? { ...(a.info ? { vendor: a.info.vendor, architecture: a.info.architecture, description: a.info.description } : {}), isFallbackAdapter: a.isFallbackAdapter } : "no adapter";
    } catch (e) { out.webgpu = { error: String(e) }; }
    return out;
  });
}
async function cpuSnapshot(cdp) {
  const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
  return processInfo; // [{type,id,cpuTime}] cumulative CPU seconds
}
function cpuDelta(a, b, wallS) {
  const m = new Map(a.map((p) => [p.id, p]));
  const byType = {};
  for (const p of b) { const q = m.get(p.id); if (!q) continue; byType[p.type] = (byType[p.type] || 0) + (p.cpuTime - q.cpuTime); }
  return Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, +(100 * v / wallS).toFixed(1)])); // % of one core
}

async function measure(browser, url, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url, { waitUntil: "load" });
  try { await page.waitForFunction(() => typeof window.__firstFrame === "number", null, { timeout: 20000 }); }
  catch { await ctx.close(); return { error: "no window.__firstFrame within 20 s", pageErrors: errors }; }
  const firstFrame = await page.evaluate(() => window.__firstFrame);
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return { domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd }; });
  await page.waitForTimeout(1500); // settle
  const bcdp = await browser.newBrowserCDPSession();
  const c0 = await cpuSnapshot(bcdp); const t0 = Date.now();
  const f0 = await page.evaluate(() => window.__frames);
  const { d, heap } = await page.evaluate(`(${SAMPLER})(${SECONDS})`);
  const wall = (Date.now() - t0) / 1000;
  const c1 = await cpuSnapshot(bcdp);
  const f1 = await page.evaluate(() => window.__frames);
  const gpuInfo = await renderers(page);
  const canvas = await page.evaluate(() => { const c = document.querySelector("canvas"); return c ? { w: c.width, h: c.height } : null; });
  await bcdp.detach().catch(() => {});
  await ctx.close();
  const st = stats(d.slice(5)); // drop first 5 deltas
  return { viewport: `${vp.w}x${vp.h}@1`, canvas, firstFrameMs: +firstFrame.toFixed(1), nav, frame: st, appFramesCounted: f1 - f0, jsHeapBytes: heap, cpuPercentOfOneCore: cpuDelta(c0, c1, wall), gpuInfo, pageErrors: errors };
}

// ---------------------------------------------------------------------------
const apps = selectApps(args, WEB_APPS);
const sys = machine();
console.log(`machine: ${sys.cpu}, macOS ${sys.os}`);
const results = {};
let idx = 0;
for (const app of apps) {
  console.log(`\n[${app}]`);
  const b = buildWeb(app, { reuse: !!args["reuse-build"] });
  if (b.error) { console.log("   skipped: " + b.error); continue; }
  const port = PORT0 + (idx++ % 10);
  const srv = spawn(path.join(b.dir, "node_modules/.bin/vite"), ["preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: b.dir, stdio: ["ignore", "pipe", "pipe"] });
  let ready = false;
  srv.stdout.on("data", (x) => { if (String(x).includes("127.0.0.1")) ready = true; });
  srv.stderr.on("data", (x) => process.stderr.write(String(x)));
  try {
    for (let i = 0; i < 50 && !ready; i++) await new Promise((r) => setTimeout(r, 200));
    if (!ready) { console.log("   preview server did not start"); continue; }
    const url = `http://127.0.0.1:${port}/`;
    const browser = await chromium.launch({ headless: false, args: GPU_ARGS });
    const version = browser.version();
    const entry = { url, chromium: version, flags: GPU_ARGS, seconds: SECONDS, reps: REPS, runs: [] };
    // ttff: N fresh loads at 1280x800 (median); the first of the viewport measurements also reports its own
    const ttffs = [];
    for (let i = 0; i < TTFF_RUNS; i++) {
      const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      const p = await c.newPage();
      await p.goto(url);
      try { await p.waitForFunction(() => typeof window.__firstFrame === "number", null, { timeout: 20000 }); ttffs.push(await p.evaluate(() => window.__firstFrame)); } catch {}
      await c.close();
    }
    entry.timeToFirstFrameMs = ttffs.length ? { median: +median(ttffs).toFixed(1), samples: ttffs.map((x) => +x.toFixed(1)), note: "performance.now() at first drawn frame, ms since navigation start, localhost (no network), warm disk cache, fresh context each" } : null;
    for (const vp of VIEWPORTS) for (let rep = 1; rep <= REPS; rep++) {
      const r = await measure(browser, url, vp);
      r.rep = rep;
      entry.runs.push(r);
      if (r.error) console.log(`   ${vp.w}x${vp.h}: ${r.error}`);
      else console.log(`   ${r.viewport} #${rep}: ttff ${r.firstFrameMs} ms | frame avg ${r.frame.avg.toFixed(2)} ms (${r.frame.fpsAvg.toFixed(1)} fps) p95 ${r.frame.p95.toFixed(2)} max ${r.frame.max.toFixed(1)} | heap ${(r.jsHeapBytes / 1e6).toFixed(1)} MB | CPU% ${JSON.stringify(r.cpuPercentOfOneCore)} | ${r.gpuInfo.webgl?.renderer ?? "?"}${r.pageErrors.length ? " | ERRORS " + r.pageErrors[0] : ""}`);
    }
    entry.renderer = entry.runs.find((r) => r.gpuInfo)?.gpuInfo;
    await browser.close();
    results[app] = entry;
    saveResult("perf-web.json", app, entry);
  } catch (e) {
    console.log("   FAILED: " + e.message);
  } finally {
    srv.kill("SIGTERM");
    if (!args.keep) fs.rmSync(b.dir, { recursive: true, force: true });
  }
}
const p = path.join(path.dirname(new URL(import.meta.url).pathname), "results", "machine.json");
saveWhole("machine.json", sys);
