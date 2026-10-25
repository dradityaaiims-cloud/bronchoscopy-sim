// Endoscopic view shader. The airway lumen is the smooth union of tapered
// capsules along the nearest centerline segments; the camera sits inside it and
// we sphere-trace to the wall. The smooth union gives rounded carinal ridges
// for free. Rings, vessels, mucus specularity and light falloff are procedural.
// (Phase 2 can swap this for a mesh pass when a CT-derived GLB is loaded.)

export const K = 48; // nearest centerline segments evaluated per pixel

export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export const fragmentShader = /* glsl */ `
precision highp float;
#define K ${K}
varying vec2 vUv;
uniform vec2 uRes;
uniform vec3 uPos, uFwd, uUp, uRight;
uniform float uFov, uTime, uBreath;
uniform vec4 uA[K];   // segment start xyz, radius
uniform vec4 uB[K];   // segment end xyz, radius
uniform vec4 uI[K];   // arclength start, end, ring strength, ring spacing

// attributes of the nearest wall point, written by map(..., true)
float gArc, gRing, gSpace; vec3 gAxis, gRad;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// <0 inside the lumen, >0 inside the wall
float map(vec3 p, bool attr) {
  float d = 1e5, best = 1e5;
  for (int i = 0; i < K; i++) {
    vec3 a = uA[i].xyz, ba = uB[i].xyz - a, pa = p - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    vec3 q = pa - ba * h;
    float di = length(q) - mix(uA[i].w, uB[i].w, h) * uBreath;
    d = smin(d, di, 2.2);
    if (attr && di < best) {
      best = di; gArc = mix(uI[i].x, uI[i].y, h); gRing = uI[i].z; gSpace = uI[i].w;
      gAxis = normalize(ba); gRad = q;
    }
  }
  return d;
}

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y) * 0.94);
  float rr = length(p);
  if (rr > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  // equidistant fisheye: real bronchoscopes are ~120 deg with barrel distortion
  float th = rr * uFov * 0.5;
  vec2 d2 = rr > 1e-5 ? p / rr : vec2(0.0);
  vec3 rd = normalize(uFwd * cos(th) + (uRight * d2.x + uUp * d2.y) * sin(th));

  float t = 0.0; bool hit = false;
  for (int i = 0; i < 90; i++) {
    float d = map(uPos + rd * t, false);
    if (d > -0.03) { hit = true; break; }
    t += max(-d * 0.9, 0.03);
    if (t > 110.0) break;
  }

  vec3 col = vec3(0.004, 0.0, 0.0);
  if (hit) {
    vec3 pos = uPos + rd * t;
    map(pos, true);
    vec2 e = vec2(1.0, -1.0) * 0.06;
    vec3 g = e.xyy * map(pos + e.xyy, false) + e.yyx * map(pos + e.yyx, false)
           + e.yxy * map(pos + e.yxy, false) + e.xxx * map(pos + e.xxx, false);
    vec3 n = -normalize(g);

    // posterior membranous wall (no cartilage) vs cartilage-supported wall
    vec3 post = normalize(vec3(0.0, 0.0, -1.0) - gAxis * dot(vec3(0.0, 0.0, -1.0), gAxis));
    vec3 rad = normalize(gRad);
    float cosPsi = dot(rad, post);
    float membr = smoothstep(0.35, 0.65, cosPsi);
    float amp = gRing * (1.0 - membr);

    // cartilage rings: height field along the airway axis
    float ph = 6.2831853 * gArc / gSpace;
    float w = 0.5 + 0.5 * cos(ph);
    float ridge = w * w;
    float dRidge = -2.0 * w * 0.5 * sin(ph) * 6.2831853 / gSpace;
    n = normalize(n - gAxis * (dRidge * amp * 0.38));

    vec3 base = mix(vec3(0.86, 0.44, 0.41), vec3(0.95, 0.60, 0.53), noise(pos * 0.35));
    base = mix(base, vec3(0.96, 0.74, 0.68), ridge * amp * 0.45);       // pale cartilage ridges
    base *= 1.0 - 0.20 * (1.0 - ridge) * amp;                           // dark inter-ring grooves
    float psi = atan(dot(rad, cross(gAxis, post)), cosPsi);
    base *= 1.0 - 0.07 * membr * (0.5 + 0.5 * sin(psi * 30.0));         // longitudinal elastic fibres
    float v = abs(noise(pos * 0.9 + 3.1) - 0.5);                        // submucosal vessels
    base = mix(base, vec3(0.62, 0.12, 0.12), smoothstep(0.03, 0.0, v) * (0.06 + 0.16 * gRing));

    vec3 L = normalize(uPos - pos);                                     // headlight at the tip
    float atten = 1.0 / (1.0 + (t * t) / 480.0);
    float diff = max(dot(n, L), 0.0);
    vec3 H = normalize(L - rd);
    float mucus = smoothstep(0.30, 0.70, noise(pos * 0.25 + uTime * 0.03));
    float spec = pow(max(dot(n, H), 0.0), 80.0) * (0.35 + 0.65 * mucus)
               + pow(max(dot(n, H), 0.0), 12.0) * 0.10;

    col = (base * (0.03 + 1.6 * diff) + vec3(1.0, 0.93, 0.88) * spec * 0.9) * atten * 1.25;
  }

  col = 1.0 - exp(-col * 1.3);                                          // soft tone-map
  col = pow(col, vec3(0.9));
  col *= mix(1.0, 0.55, smoothstep(0.7, 1.0, rr));                      // lens vignette
  col += (fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.02;
  col *= smoothstep(1.0, 0.985, rr);                                    // soft circular mask
  gl_FragColor = vec4(col, 1.0);
}`;
