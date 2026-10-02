// compare.mjs — shader port verification / image diff.
//
//   node compare.mjs                 render GLSL, SkSL, WGSL at t = 0, 10, 30 (1200x775,
//                                    Chromium via Playwright), save shaders/out/<lang>_t<t>.png (gitignored),
//                                    check each port vs GLSL (SSIM >= 0.98, mean abs diff <= 2/255)
//   node compare.mjs a.png b.png     SSIM + mean abs diff of two images (same size)
//
// Needs a static server at the repo root: python3 -m http.server 5160 --bind 127.0.0.1
// HEADED=1 runs a headed browser (use it if WebGPU is unavailable headless).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import ssimPkg from 'ssim.js';
const ssim = ssimPkg.ssim ?? ssimPkg.default ?? ssimPkg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5160';
const W = 1200, H = 775, TIMES = [0, 10, 30];
const PAGES = { glsl: 'index.html?clean&', sksl: 'skia.html?', wgsl: 'webgpu.html?' };

export function diff(fileA, fileB) {
  const a = PNG.sync.read(fs.readFileSync(fileA)), b = PNG.sync.read(fs.readFileSync(fileB));
  if (a.width !== b.width || a.height !== b.height) throw new Error(`size mismatch ${fileA} vs ${fileB}`);
  let sum = 0, max = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) {
    const d = Math.abs(a.data[i + c] - b.data[i + c]); sum += d; if (d > max) max = d;
  }
  const mad = sum / (a.width * a.height * 3);
  const { mssim } = ssim(
    { data: new Uint8ClampedArray(a.data), width: a.width, height: a.height },
    { data: new Uint8ClampedArray(b.data), width: b.width, height: b.height });
  return { ssim: mssim, meanAbsDiff: mad, maxAbsDiff: max };
}

const fmt = (r) => `SSIM ${r.ssim.toFixed(4)}  meanAbsDiff ${r.meanAbsDiff.toFixed(2)}/255  max ${r.maxAbsDiff}`;

if (process.argv.length === 4) {
  console.log(fmt(diff(process.argv[2], process.argv[3])));
} else {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: !process.env.HEADED,
    args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-features=Vulkan'],
  });
  const out = path.join(ROOT, 'shaders/out');
  fs.mkdirSync(out, { recursive: true });
  let ok = true;
  for (const t of TIMES) {
    for (const [lang, page] of Object.entries(PAGES)) {
      const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await p.goto(`${BASE}/shaders/harness/${page}t=${t}`);
      await p.waitForFunction(() => window.__frames > 3 || window.__error, null, { timeout: 30000 });
      const err = await p.evaluate(() => window.__error || (document.getElementById('err')?.style.display === 'block' && document.getElementById('err').textContent));
      if (err) { console.error(`${lang} t=${t}: ${err}`); ok = false; await p.close(); continue; }
      await p.locator('canvas').screenshot({ path: path.join(out, `${lang}_t${t}.png`) });
      await p.close();
    }
    for (const lang of ['sksl', 'wgsl']) {
      const f = path.join(out, `${lang}_t${t}.png`);
      if (!fs.existsSync(f)) continue;
      const r = diff(path.join(out, `glsl_t${t}.png`), f);
      const pass = r.ssim >= 0.98 && r.meanAbsDiff <= 2;
      ok &&= pass;
      console.log(`t=${String(t).padStart(2)} ${lang} vs glsl: ${fmt(r)}  ${pass ? 'PASS' : 'FAIL'}`);
    }
  }
  await browser.close();
  process.exit(ok ? 0 : 1);
}
