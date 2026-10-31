// Per-photo decisions that are pure math (no WebGL), so they're unit-tested:
// auto exposure, the random light leak and the date stamp text.
import type { FilmPreset } from "./preset";

// sRGB (0–1) → linear light.
export function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// Gain (multiplier in linear light) that brings the photo's average
// brightness to the preset's target, without blowing the highlights.
// `luminances` are linear values sampled from a small thumbnail.
export function computeExposureGain(
  luminances: ArrayLike<number>,
  exposure: FilmPreset["exposure"],
): number {
  const n = luminances.length;
  if (n === 0) return 1;

  // Log-average: robust to a few very bright or very dark pixels.
  let logSum = 0;
  const sorted = Float64Array.from(luminances).sort();
  for (let i = 0; i < n; i++) logSum += Math.log(sorted[i] + 1e-4);
  const logAverage = Math.exp(logSum / n);

  // Middle grey in linear light is ~0.18; target is expressed in sRGB-ish
  // terms (0.42 ≈ middle grey after gamma), so convert it.
  const targetLinear = toLinear(exposure.target);
  let gain = targetLinear / Math.max(logAverage, 1e-4);

  // Highlight protection: keep the 98th percentile under the limit.
  const p98 = sorted[Math.min(n - 1, Math.floor(n * 0.98))];
  if (p98 > 0) gain = Math.min(gain, toLinear(exposure.highlightLimit) / p98);

  return clamp(gain, exposure.minGain, exposure.maxGain);
}

export type LightLeak = {
  side: 0 | 1 | 2 | 3; // top, right, bottom, left
  position: number; // where along that edge (0–1)
  spread: number; // how wide along the edge (0–1)
};

// Deterministic per seed, so the same photo always gets the same leak
// (handy in /lab) while different photos get different ones.
export function pickLightLeak(
  seed: number,
  lightLeak: FilmPreset["lightLeak"],
): LightLeak | null {
  const random = mulberry32(seed);
  if (random() >= lightLeak.probability) return null;
  return {
    side: Math.floor(random() * 4) as LightLeak["side"],
    position: 0.15 + random() * 0.7,
    spread: 0.35 + random() * 0.45,
  };
}

// Like the stamp on a 90s point-and-shoot: '26 10 31
export function formatDateStamp(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `'${yy} ${mm} ${dd}`;
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

// Small, fast seeded PRNG.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}
