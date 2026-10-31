// GLSL ES 1.0 (WebGL 1) for the widest phone support.
// Texture coordinates: (0,0) is the bottom-left of the photo.

export const VERTEX = /* glsl */ `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const COMMON = /* glsl */ `
precision highp float;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

// Pass 1 — exposure + color grade, at full resolution.
export const GRADE = /* glsl */ `${COMMON}
uniform sampler2D uImage;
uniform float uGain;
uniform float uWarmth;
uniform float uTint;
uniform float uSkinProtection;
uniform vec3 uShadowTint;
uniform float uShadowTintAmount;
uniform vec3 uHighlightTint;
uniform float uHighlightTintAmount;
uniform float uContrast;
uniform float uBlackLift;
uniform float uWhitePoint;
uniform float uSatGlobal;
uniform float uSatReds;
uniform float uSatGreens;
uniform float uSatSkin;

// Skin detection in YCbCr space (classic chroma ranges), feathered.
float skinMask(vec3 c) {
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  float cb = 0.5 - 0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b;
  float cr = 0.5 + 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b;
  float m = smoothstep(0.27, 0.32, cb) * (1.0 - smoothstep(0.48, 0.53, cb))
          * smoothstep(0.50, 0.55, cr) * (1.0 - smoothstep(0.66, 0.71, cr));
  return m * smoothstep(0.10, 0.25, y);
}

// Soft highlight roll-off: values above the knee compress smoothly
// towards 1 instead of clipping.
vec3 shoulder(vec3 x) {
  float k = 0.75;
  vec3 over = max(x - k, 0.0);
  return min(x, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

void main() {
  vec3 c = texture2D(uImage, vUv).rgb;
  float skin = skinMask(c);

  // Exposure, in linear light.
  vec3 lin = pow(c, vec3(2.2)) * uGain;
  c = pow(shoulder(lin), vec3(1.0 / 2.2));

  // Warm, golden balance — skin gets less of it so it doesn't turn orange.
  float w = uWarmth * (1.0 - uSkinProtection * skin);
  c *= vec3(1.0 + w, 1.0 + w * 0.25 - uTint, 1.0 - w * 0.6);

  // Gentle S-curve.
  vec3 cc = clamp(c, 0.0, 1.0);
  c = mix(cc, cc * cc * (3.0 - 2.0 * cc), uContrast);

  // Split toning: amber shadows, creamy highlights.
  float l = luma(c);
  c += uShadowTint * uShadowTintAmount * pow(1.0 - l, 3.0);
  c = mix(c, c * uHighlightTint, uHighlightTintAmount * smoothstep(0.5, 1.0, l));

  // Lifted blacks, never-pure whites.
  c = uBlackLift + clamp(c, 0.0, 1.0) * (uWhitePoint - uBlackLift);

  // Saturation: contained overall, deeper reds and greens, protected skin.
  float h = rgb2hsv(c).x;
  float redW = max(1.0 - min(h, 1.0 - h) / 0.09, 0.0);
  float greenW = max(1.0 - abs(h - 0.3) / 0.12, 0.0);
  float sat = uSatGlobal * mix(1.0, uSatReds, redW) * mix(1.0, uSatGreens, greenW);
  sat = mix(sat, uSatSkin, skin);
  c = mix(vec3(luma(c)), c, sat);

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// Keeps only the bright parts (source of halation).
export const BRIGHT_PASS = /* glsl */ `${COMMON}
uniform sampler2D uImage;
uniform float uThreshold;
void main() {
  vec3 c = texture2D(uImage, vUv).rgb;
  gl_FragColor = vec4(c * smoothstep(uThreshold, 1.0, luma(c)), 1.0);
}`;

// Separable Gaussian blur (9 taps folded into 5 bilinear samples).
export const BLUR = /* glsl */ `${COMMON}
uniform sampler2D uImage;
uniform vec2 uStep;
void main() {
  vec3 s = texture2D(uImage, vUv).rgb * 0.2270270270;
  s += texture2D(uImage, vUv + uStep * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(uImage, vUv - uStep * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(uImage, vUv + uStep * 3.2307692308).rgb * 0.0702702703;
  s += texture2D(uImage, vUv - uStep * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}`;

// Final pass — edge softness, halation, light leak, vignette and grain.
export const COMPOSITE = /* glsl */ `${COMMON}
uniform sampler2D uGraded;
uniform sampler2D uSoft;
uniform sampler2D uGlow;
uniform float uAspect;
uniform float uEdgeAmount;
uniform float uEdgeStart;
uniform float uHalStrength;
uniform vec3 uHalColor;
uniform float uLeakOn;
uniform vec2 uLeakOrigin;
uniform vec2 uLeakAlong;
uniform vec2 uLeakInward;
uniform float uLeakSpread;
uniform float uLeakSize;
uniform float uLeakIntensity;
uniform vec3 uLeakA;
uniform vec3 uLeakB;
uniform float uVigAmount;
uniform float uVigSoftness;
uniform float uGrainAmount;
uniform float uGrainSize;
uniform float uGrainShadowBoost;
uniform float uSeed;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Smooth value noise: round-ish grain clumps instead of square pixels.
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 screen(vec3 base, vec3 light) { return 1.0 - (1.0 - base) * (1.0 - light); }

void main() {
  // Distance from the center: 0 in the middle, 1 in the corners.
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float d = length(p) / length(vec2(uAspect, 1.0) * 0.5);

  vec3 c = mix(
    texture2D(uGraded, vUv).rgb,
    texture2D(uSoft, vUv).rgb,
    uEdgeAmount * smoothstep(uEdgeStart, 1.0, d)
  );

  // Halation: red-orange glow around bright lights.
  vec3 glow = texture2D(uGlow, vUv).rgb;
  c = screen(c, uHalColor * luma(glow) * uHalStrength);

  // Light leak bleeding in from one edge.
  if (uLeakOn > 0.5) {
    vec2 q = vUv - uLeakOrigin;
    float along = dot(q, uLeakAlong) / uLeakSpread;
    float into = max(dot(q, uLeakInward), 0.0) / uLeakSize;
    float shape = exp(-along * along * 2.5) * exp(-into * 2.2);
    vec3 col = mix(uLeakB, uLeakA, exp(-into * 4.0));
    c = screen(c, col * shape * uLeakIntensity);
  }

  // Soft vignette.
  float vigStart = 1.0 - uVigSoftness;
  c *= 1.0 - uVigAmount * smoothstep(vigStart * 0.9, 1.05, d);

  // Film grain: fine, two octaves, stronger in the shadows.
  vec2 gp = gl_FragCoord.xy / uGrainSize + uSeed;
  float n = (noise(gp) - 0.5) * 0.75 + (noise(gp * 2.3 + 17.0) - 0.5) * 0.5;
  float l = luma(c);
  float g = uGrainAmount * (1.0 + uGrainShadowBoost * (1.0 - l)) * (1.0 - 0.5 * l * l);
  c += n * g;

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
