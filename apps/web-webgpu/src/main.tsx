import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Effect from "./Effect";
import FpsOverlay from "./FpsOverlay";
import { instances, recordFrame } from "./stress";

declare global {
  interface Window {
    __firstFrame?: number;
    __frames: number;
  }
}
window.__frames = 0;

const showFps = new URLSearchParams(location.search).has("fps");
const onFirstFrame = () => {
  if (window.__firstFrame === undefined) window.__firstFrame = performance.now();
};
const onFrame = () => {
  window.__frames++;
  recordFrame();
};
// Extra stress instances (index > 0) don't feed the shared counters.
const noop = () => {};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Effect onFirstFrame={onFirstFrame} onFrame={onFrame} />
    {/* stress mode: copies stacked on top, each at 50% opacity so the compositor can't cull occluded layers */}
    {Array.from({ length: instances - 1 }, (_, i) => (
      <div key={i} style={{ opacity: 0.5 }}>
        <Effect onFirstFrame={noop} onFrame={noop} />
      </div>
    ))}
    {showFps && <FpsOverlay />}
  </StrictMode>,
);
