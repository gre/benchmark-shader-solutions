// Build a web app in a temp COPY (never in apps/). Shared by size.mjs and perf-web.mjs.
import fs from "node:fs";
import path from "node:path";
import { cloneApp, tryRun, TMP, appDir } from "./lib.mjs";

export function buildWeb(app, { reuse = false } = {}) {
  const dir = path.join(TMP, "web", app);
  if (reuse && fs.existsSync(path.join(dir, "dist", "index.html"))) return { dir, reused: true, buildMs: null };
  if (!fs.existsSync(path.join(appDir(app), "node_modules"))) return { error: "apps/" + app + "/node_modules missing (run npm ci in the app first)" };
  cloneApp(app, "web");
  const t0 = Date.now();
  const r = tryRun("npm", ["run", "build"], { cwd: dir, env: { ...process.env, CI: "1" } });
  if (!r.ok) return { error: "build failed: " + r.out.slice(-600) };
  return { dir, reused: false, buildMs: Date.now() - t0, log: r.out.slice(-400) };
}
