// silk.wgsl — WGSL port of silk.glsl (the source of truth).
// Uniforms, constants and math are identical; see silk.glsl for the docs.
// Differences: @builtin(position) is already TOP-LEFT (no y flip), in
// physical pixels. Entry points: vs_main (fullscreen triangle, draw 3
// vertices, no vertex buffer) and fs_main.
//
// Uniform buffer layout (32 bytes, group 0 binding 0):
//   offset  0: resolution (vec2f), offset 8: padding (vec2f),
//   offset 16: phase (vec4f)   ->  Float32Array [w, h, 0, 0, p.x, p.y, p.z, p.w]

struct Uniforms {
  resolution: vec2f,
  _pad: vec2f,
  phase: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

const TAU = 6.28318530718;
const AMP = 0.02;
const GLOW = 0.25;
const HUE_AMT = 0.5;
const REF_ASPECT = 1.5483870968;

fn poly9(s: f32, a: vec4f, b: vec4f, c: vec2f) -> f32 {
  return a.x + s * (a.y + s * (a.z + s * (a.w + s * (b.x + s * (b.y + s * (b.z + s * (b.w + s * (c.x + s * c.y))))))));
}
fn dpoly9(s: f32, a: vec4f, b: vec4f, c: vec2f) -> f32 {
  return a.y + s * (2.0 * a.z + s * (3.0 * a.w + s * (4.0 * b.x + s * (5.0 * b.y + s * (6.0 * b.z + s * (7.0 * b.w + s * (8.0 * c.x + s * 9.0 * c.y)))))));
}

fn curveDist(p: vec2f, a: vec4f, b: vec4f, c: vec2f, k: f32) -> f32 {
  let s = 2.0 * p.y - 1.0;
  var x = poly9(s, a, b, c);
  var dxdy = 2.0 * dpoly9(s, a, b, c);
  let m1 = AMP * 0.6 * sin(TAU * u.phase.x);
  let m2 = AMP * 0.4 * sin(TAU * u.phase.y);
  let q1 = 2.3 * p.y - 0.5 * k;
  let q2 = 3.1 * p.y + 0.8 * k;
  x += m1 * cos(q1) + m2 * cos(q2);
  dxdy -= m1 * 2.3 * sin(q1) + m2 * 3.1 * sin(q2);
  return (p.x - x) / sqrt(1.0 + dxdy * dxdy);
}

fn sheet(p: vec2f, dl: f32, dr: f32, A: vec3f, B: vec3f, K: vec3f, sh: vec4f, blob: vec3f) -> vec3f {
  let q = p - blob.xy;
  let V = 1.0 - sh.w * (1.0 - exp(-(q.y * q.y + sh.z * q.x * q.x) / (blob.z * blob.z)));
  let S = 1.0 - exp(-dl / sh.x);
  let C = exp(-dr / sh.y);
  return A + V * (B * S + K * C);
}

fn rim(d: f32, w: f32) -> f32 {
  let x = (d + 0.3 * w) / w;
  return exp(-x * x) + 0.3 * exp(-abs(d) / 0.004);
}

fn fold(d: f32, edge: f32, soft: f32) -> f32 {
  return smoothstep(0.0, 0.003, d) * (1.0 - smoothstep(edge - soft, edge + soft, d));
}

fn silk(p: vec2f, px: f32) -> vec3f {
  let d1 = curveDist(p, vec4f(0.32007, -0.65613, -0.08730, 0.58386), vec4f(0.23268, 0.14888, -0.31484, -0.93669), vec2f(0.04529, 0.61244), 0.0);
  let d2 = curveDist(p, vec4f(0.65113, -1.29628, 0.17533, 1.08321), vec4f(-0.93633, 0.12019, 1.29132, -1.18355), vec2f(-0.67237, 0.76730), 1.0);
  let d3 = curveDist(p, vec4f(0.93758, -0.81075, 0.42935, 0.43317), vec4f(-0.50278, -0.10154, 0.21603, -0.01639), vec2f(0.0), 2.0);
  let d4 = curveDist(p, vec4f(1.25732, -0.39139, 0.16511, 0.10852), vec4f(-0.18554, 0.11610, 0.08311, -0.09875), vec2f(0.0), 3.0);

  let w = max(0.0015, 0.9 * px);

  let e = p - vec2f(0.55, 0.50);
  let env = exp(-0.6 * dot(e, e));
  let g = TAU * u.phase.z;
  let R1 = vec3f(0.62, 0.64, 0.98) * env * (1.0 + GLOW * sin(g + 3.0 * p.y));
  let R2 = vec3f(0.66, 0.70, 1.00) * env * (1.0 + GLOW * sin(g + 3.0 * p.y + 1.7));
  let R3 = vec3f(0.66, 0.66, 0.80) * env * (1.0 + GLOW * sin(g + 3.0 * p.y + 3.4));
  let R4 = vec3f(0.64, 0.70, 0.94) * env * (1.0 + GLOW * sin(g + 3.0 * p.y + 5.1));

  var c: vec3f;
  var r = 0.0;
  var rc = vec3f(0.0);
  if (d1 < 0.0) {
    c = sheet(p, 1.0, -d1, vec3f(0.036, 0.044, 0.099), vec3f(0.338, 0.285, 0.373), vec3f(0.009, 0.048, 0.099), vec4f(0.150, 0.170, 0.550, 1.0), vec3f(0.539, 0.597, 0.446));
    r = rim(d1, w); rc = R1;
  } else if (d2 < 0.0) {
    c = sheet(p, d1, -d2, vec3f(0.0, 0.0, 0.017), vec3f(0.753, 0.773, 1.0), vec3f(0.131, 0.122, 0.208), vec4f(0.961, 0.520, 0.0, 1.0), vec3f(2.064, 0.681, 0.829));
    let r1 = rim(d1, w);
    let r2 = rim(d2, w);
    rc = select(R2, R1, r1 > r2); r = max(r1, r2);
    c += vec3f(0.10, 0.10, 0.22) * fold(d1, 0.024, 0.006) * (1.0 - smoothstep(0.10, 0.42, p.y));
  } else if (d3 < 0.0) {
    c = sheet(p, d2, -d3, vec3f(0.011, 0.014, 0.051), vec3f(0.466, 0.424, 0.537), vec3f(0.210, 0.232, 0.358), vec4f(0.227, 0.114, 1.0, 0.677), vec3f(0.403, 0.680, 0.315));
    let r2 = rim(d2, w);
    let r3 = rim(d3, w);
    rc = select(R3, R2, r2 > r3); r = max(r2, r3);
    c += vec3f(0.12, 0.12, 0.26) * fold(d2, 0.011, 0.004) * (1.0 - smoothstep(0.10, 0.36, p.y));
  } else if (d4 < 0.0) {
    c = sheet(p, d3, -d4, vec3f(0.036, 0.025, 0.113), vec3f(0.931, 1.0, 0.966), vec3f(0.020, 0.257, 0.408), vec4f(0.283, 1.5, 1.0, 0.933), vec3f(1.724, 0.790, 0.380));
    let r3 = rim(d3, w);
    let r4 = rim(d4, w);
    rc = select(R4, R3, r3 > r4); r = max(r3, r4);
  } else {
    c = sheet(p, d4, 1.0, vec3f(0.069, 0.085, 0.167), vec3f(0.764, 0.843, 1.0), vec3f(0.0), vec4f(0.190, 1.348, 1.0, 1.0), vec3f(1.920, 0.425, 0.580));
    r = rim(d4, w); rc = R4;
  }
  c = mix(c, rc, clamp(r, 0.0, 1.0));

  let h = HUE_AMT * sin(TAU * u.phase.w);
  let l = dot(c, vec3f(0.3, 0.5, 0.2));
  c += l * vec3f(0.10 * h, -0.04 * abs(h), -0.10 * h + 0.04 * abs(h));
  return c;
}

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(pos[i], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let frag = fragCoord.xy; // already top-left origin
  let res = u.resolution;
  let scale = max(res.x / REF_ASPECT, res.y);
  let p = (frag - 0.5 * res) / scale + vec2f(0.5 * REF_ASPECT, 0.5);
  var c = silk(p, 1.0 / scale);
  let n = fract(52.9829189 * fract(dot(floor(frag), vec2f(0.06711056, 0.00583715))));
  c += (n - 0.5) / 255.0;
  return vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), 1.0);
}
