import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TECHS, type TechName } from "./techs";

// URL: ?tech=native&shader=silk&<param>=<value>…&speed=<x>&ui=0
//   ui=0 hides the panel and the fps readout (pixel checks: add speed=0).
const Q = new URLSearchParams(location.search);
const techNames = Object.keys(TECHS) as TechName[];
const initialTech = (techNames.includes(Q.get("tech") as TechName) ? Q.get("tech") : techNames[0]) as TechName;
const showUi = Q.get("ui") !== "0";

function queryParams(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Q) if (!["tech", "shader", "ui"].includes(k) && v !== "" && !isNaN(Number(v))) out[k] = Number(v);
  return out;
}

function Fps() {
  const [fps, setFps] = useState("…");
  useEffect(() => {
    let raf = 0, n = 0, t0 = performance.now();
    const loop = (now: number) => {
      n++;
      if (now - t0 >= 500) { setFps(((n * 1000) / (now - t0)).toFixed(1)); n = 0; t0 = now; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span>{fps} fps (rAF)</span>;
}

function App() {
  const [tech, setTech] = useState<TechName>(initialTech);
  const { Effect, schema } = TECHS[tech];
  const shaders = schema.shaderNames();
  const [shader, setShader] = useState<string>(shaders.includes(Q.get("shader") ?? "") ? Q.get("shader")! : shaders[0]);
  const [params, setParams] = useState<Record<string, number>>(queryParams);
  const specs = schema.getShaderSchema(shader).params;
  const values = Object.fromEntries(
    Object.entries(specs).map(([k, s]) => [k, Math.min(s.max, Math.max(s.min, params[k] ?? s.default))]),
  );

  return (
    <>
      <Effect
        key={tech}
        shader={shader as never}
        params={params}
        style={{ position: "fixed", inset: 0 }}
      />
      {showUi && (
        <div style={panel}>
          <div style={row}>
            <b>@shader-bench</b>
            <Fps />
          </div>
          <label style={row}>
            tech
            <select value={tech} onChange={(e) => setTech(e.target.value as TechName)}>
              {techNames.map((t) => <option key={t} value={t}>{TECHS[t].label}</option>)}
            </select>
          </label>
          <label style={row}>
            shader
            <select value={shader} onChange={(e) => { setShader(e.target.value); setParams({}); }}>
              {shaders.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          {Object.entries(specs).map(([name, s]) => (
            <label key={name} style={slider}>
              <span>{name}</span>
              <input
                type="range" min={s.min} max={s.max} step={s.step ?? 0.01} value={values[name]}
                onChange={(e) => setParams({ ...params, [name]: Number(e.target.value) })}
              />
              <span style={{ textAlign: "right" }}>{values[name].toFixed(2)}</span>
            </label>
          ))}
          <button onClick={() => setParams({})}>reset</button>
        </div>
      )}
    </>
  );
}

const panel: React.CSSProperties = {
  position: "fixed", top: 10, right: 10, width: 260, padding: "10px 12px", zIndex: 1,
  background: "rgba(10,10,20,.82)", borderRadius: 8, display: "grid", gap: 6,
};
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 };
const slider: React.CSSProperties = { display: "grid", gridTemplateColumns: "48px 1fr 40px", gap: 6, alignItems: "center" };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
