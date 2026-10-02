export default `
// silk.glsl — "Silk" animated background. GLSL ES 1.00, SOURCE OF TRUTH.
//
// UNIFORMS (frozen at G1, 2026-10-02 — identical in the SkSL / WGSL ports):
//   vec2 resolution  viewport size, in the same units as the fragment
//                    coordinate (GL/WebGPU: physical pixels; Skia: canvas
//                    units, i.e. points on React Native)
//   vec4 phase       animation phases, each in [0,1), computed on the CPU in
//                    double precision as fract(t / period):
//                      x = fract(t / 41)  curve undulation A
//                      y = fract(t / 59)  curve undulation B
//                      z = fract(t / 23)  rim glow breathing
//                      w = fract(t / 53)  hue drift
//
// COORDINATES: the shader works in "reference units": the 1200x775 target
// framing has height 1 and width REF_ASPECT, origin TOP-LEFT, y down. GL's
// gl_FragCoord is bottom-left, so main() flips y. Skia (SkSL) and WebGPU
// fragment coords are already top-left: their ports must NOT flip.
// The reference frame is "cover"-fitted to the viewport, centered.
//
// Portable subset: no textures, no derivatives, no dynamic indexing,
// no loops. Rim AA width comes from the resolution.

precision highp float;

uniform vec2 resolution;
uniform vec4 phase;

const float TAU = 6.28318530718;
const float AMP = 0.02;      // curve undulation amplitude (ref units)
const float GLOW = 0.25;     // rim glow breathing amount
const float HUE_AMT = 0.5;   // hue drift amount
const float REF_ASPECT = 1.5483870968; // 1200 / 775

// Curves: x = P(s), s = 2y - 1 in [-1, 1], degree-9 polynomial, coefficients
// low->high packed as (a.xyzw, b.xyzw, c.xy). Fitted on the target's rims.
float poly9(float s, vec4 a, vec4 b, vec2 c) {
  return a.x + s * (a.y + s * (a.z + s * (a.w + s * (b.x + s * (b.y + s * (b.z + s * (b.w + s * (c.x + s * c.y))))))));
}
float dpoly9(float s, vec4 a, vec4 b, vec2 c) {
  return a.y + s * (2.0 * a.z + s * (3.0 * a.w + s * (4.0 * b.x + s * (5.0 * b.y + s * (6.0 * b.z + s * (7.0 * b.w + s * (8.0 * c.x + s * 9.0 * c.y)))))));
}

// Signed perpendicular distance from p to curve k (positive = right of it).
// Undulation = two standing waves whose amplitude follows sin(phase), so
// t = 0 is exactly the fitted target and neighbours move almost together.
float curveDist(vec2 p, vec4 a, vec4 b, vec2 c, float k) {
  float s = 2.0 * p.y - 1.0;
  float x = poly9(s, a, b, c);
  float dxdy = 2.0 * dpoly9(s, a, b, c);
  float m1 = AMP * 0.6 * sin(TAU * phase.x);
  float m2 = AMP * 0.4 * sin(TAU * phase.y);
  float q1 = 2.3 * p.y - 0.5 * k;
  float q2 = 3.1 * p.y + 0.8 * k;
  x += m1 * cos(q1) + m2 * cos(q2);
  dxdy -= m1 * 2.3 * sin(q1) + m2 * 3.1 * sin(q2);
  return (p.x - x) / sqrt(1.0 + dxdy * dxdy);
}

// One sheet: A + V * (B * S + K * C) where S = lit amount away from the
// sheet above (shadow at its left edge), C = curl highlight towards its own
// right edge, V = soft light blob. L0 / L4 have no left / right edge: they
// pass a constant 1.0 (as in the fit). sh = (shadowW, curlW, blob x-weight,
// blob strength), blob = (center x, center y, radius). Fitted on the target.
vec3 sheet(vec2 p, float dl, float dr, vec3 A, vec3 B, vec3 K, vec4 sh, vec3 blob) {
  vec2 q = p - blob.xy;
  float V = 1.0 - sh.w * (1.0 - exp(-(q.y * q.y + sh.z * q.x * q.x) / (blob.z * blob.z)));
  float S = 1.0 - exp(-dl / sh.x);
  float C = exp(-dr / sh.y);
  return A + V * (B * S + K * C);
}

// Rim line of the sheet whose right edge is at signed distance d
// (d < 0 on the sheet itself), slightly inside the sheet.
float rim(float d, float w) {
  float x = (d + 0.3 * w) / w;
  return exp(-x * x) + 0.3 * exp(-abs(d) / 0.004);
}

// Out-of-focus back of the fold: a plateau right of the rim (d > 0) up to
// \`edge\`, with a soft outer falloff (top folds of C1/C2).
float fold(float d, float edge, float soft) {
  return smoothstep(0.0, 0.003, d) * (1.0 - smoothstep(edge - soft, edge + soft, d));
}

vec3 silk(vec2 p, float px) {
  float d1 = curveDist(p, vec4(0.32007, -0.65613, -0.08730, 0.58386), vec4(0.23268, 0.14888, -0.31484, -0.93669), vec2(0.04529, 0.61244), 0.0);
  float d2 = curveDist(p, vec4(0.65113, -1.29628, 0.17533, 1.08321), vec4(-0.93633, 0.12019, 1.29132, -1.18355), vec2(-0.67237, 0.76730), 1.0);
  float d3 = curveDist(p, vec4(0.93758, -0.81075, 0.42935, 0.43317), vec4(-0.50278, -0.10154, 0.21603, -0.01639), vec2(0.0), 2.0);
  float d4 = curveDist(p, vec4(1.25732, -0.39139, 0.16511, 0.10852), vec4(-0.18554, 0.11610, 0.08311, -0.09875), vec2(0.0), 3.0);

  // rim width: ~1 px of the 1200x775 framing, never thinner than ~1 screen px
  float w = max(0.0015, 0.9 * px);

  // rim envelope (dimmer towards the corners) x glow breathing travelling
  // slowly along the curves
  vec2 e = p - vec2(0.55, 0.50);
  float env = exp(-0.6 * dot(e, e));
  float g = TAU * phase.z;
  vec3 R1 = vec3(0.62, 0.64, 0.98) * env * (1.0 + GLOW * sin(g + 3.0 * p.y));
  vec3 R2 = vec3(0.66, 0.70, 1.00) * env * (1.0 + GLOW * sin(g + 3.0 * p.y + 1.7));
  vec3 R3 = vec3(0.66, 0.66, 0.80) * env * (1.0 + GLOW * sin(g + 3.0 * p.y + 3.4));
  vec3 R4 = vec3(0.64, 0.70, 0.94) * env * (1.0 + GLOW * sin(g + 3.0 * p.y + 5.1));

  vec3 c;
  float r = 0.0;
  vec3 rc = vec3(0.0);
  if (d1 < 0.0) {
    c = sheet(p, 1.0, -d1, vec3(0.036, 0.044, 0.099), vec3(0.338, 0.285, 0.373), vec3(0.009, 0.048, 0.099), vec4(0.150, 0.170, 0.550, 1.0), vec3(0.539, 0.597, 0.446));
    r = rim(d1, w); rc = R1;
  } else if (d2 < 0.0) {
    c = sheet(p, d1, -d2, vec3(0.0, 0.0, 0.017), vec3(0.753, 0.773, 1.0), vec3(0.131, 0.122, 0.208), vec4(0.961, 0.520, 0.0, 1.0), vec3(2.064, 0.681, 0.829));
    float r1 = rim(d1, w), r2 = rim(d2, w);
    rc = r1 > r2 ? R1 : R2; r = max(r1, r2);
    c += vec3(0.10, 0.10, 0.22) * fold(d1, 0.024, 0.006) * (1.0 - smoothstep(0.10, 0.42, p.y));
  } else if (d3 < 0.0) {
    c = sheet(p, d2, -d3, vec3(0.011, 0.014, 0.051), vec3(0.466, 0.424, 0.537), vec3(0.210, 0.232, 0.358), vec4(0.227, 0.114, 1.0, 0.677), vec3(0.403, 0.680, 0.315));
    float r2 = rim(d2, w), r3 = rim(d3, w);
    rc = r2 > r3 ? R2 : R3; r = max(r2, r3);
    c += vec3(0.12, 0.12, 0.26) * fold(d2, 0.011, 0.004) * (1.0 - smoothstep(0.10, 0.36, p.y));
  } else if (d4 < 0.0) {
    c = sheet(p, d3, -d4, vec3(0.036, 0.025, 0.113), vec3(0.931, 1.0, 0.966), vec3(0.020, 0.257, 0.408), vec4(0.283, 1.5, 1.0, 0.933), vec3(1.724, 0.790, 0.380));
    float r3 = rim(d3, w), r4 = rim(d4, w);
    rc = r3 > r4 ? R3 : R4; r = max(r3, r4);
  } else {
    c = sheet(p, d4, 1.0, vec3(0.069, 0.085, 0.167), vec3(0.764, 0.843, 1.0), vec3(0.0), vec4(0.190, 1.348, 1.0, 1.0), vec3(1.920, 0.425, 0.580));
    r = rim(d4, w); rc = R4;
  }
  c = mix(c, rc, clamp(r, 0.0, 1.0));

  // hue drift indigo <-> violet <-> blue, stronger on brighter areas
  float h = HUE_AMT * sin(TAU * phase.w);
  float l = dot(c, vec3(0.3, 0.5, 0.2));
  c += l * vec3(0.10 * h, -0.04 * abs(h), -0.10 * h + 0.04 * abs(h));
  return c;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y); // top-left origin
  float scale = max(resolution.x / REF_ASPECT, resolution.y);
  vec2 p = (frag - 0.5 * resolution) / scale + vec2(0.5 * REF_ASPECT, 0.5);
  vec3 c = silk(p, 1.0 / scale);
  // dither against banding in the dark gradients (interleaved gradient
  // noise: plain arithmetic, so every port produces the same pattern)
  float n = fract(52.9829189 * fract(dot(floor(frag), vec2(0.06711056, 0.00583715))));
  c += (n - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
