import { useEffect, useRef, useState } from "react";
import { Shaders, Node, GLSL } from "gl-react";
import { Surface } from "gl-react-dom";
import { getPhases } from "./time";
import silk from "./shaders/silk.glsl";

/**
 * gl-react implementation of the Effect contract (see web-baseline for the contract).
 *
 * Animation model: a requestAnimationFrame loop calls setState({phases}) every frame,
 * which re-renders <Node uniforms=...>; gl-react marks the surface dirty and its own internal
 * rAF loop performs the actual draw (so a draw lands on the next rAF tick). onDraw on the Node
 * feeds onFirstFrame/onFrame. There is no imperative uniform path in gl-react: uniforms are props.
 */
const shaders = Shaders.create({ silk: { frag: GLSL`${silk}` } });

const dprCap = () => Math.min(window.devicePixelRatio || 1, 2);
const readSize = () => ({ w: window.innerWidth, h: window.innerHeight, dpr: dprCap() });

export default function Effect({ onFirstFrame, onFrame }: { onFirstFrame: () => void; onFrame: () => void }) {
  const [size, setSize] = useState(readSize);
  const [phases, setPhases] = useState(() => getPhases());
  const cb = useRef({ onFirstFrame, onFrame });
  cb.current = { onFirstFrame, onFrame };
  const first = useRef(true);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setPhases(getPhases());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onResize = () => setSize(readSize());
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const onDraw = () => {
    if (first.current) {
      first.current = false;
      cb.current.onFirstFrame();
    }
    cb.current.onFrame();
  };

  const { w, h, dpr } = size;
  return (
    <Surface
      width={w}
      height={h}
      pixelRatio={dpr}
      style={{ position: "fixed", inset: 0 }}
      webglContextAttributes={{ antialias: false, alpha: false, preserveDrawingBuffer: false }}
    >
      <Node
        shader={shaders.silk}
        uniforms={{ resolution: [Math.floor(w * dpr), Math.floor(h * dpr)], phase: phases }}
        onDraw={onDraw}
      />
    </Surface>
  );
}
