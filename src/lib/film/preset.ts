// Film look: warm 35mm with flash-on-film character, tuned for daylight
// events. Every value here can be tweaked live in /lab, then pasted back.
//
// Spatial values (grain size, blur radii) are relative to a 2048px-wide
// photo, so previews at any size look the same as the final upload.

export type FilmPreset = {
  // Auto exposure, applied first so dim interiors and bright outdoor shots
  // land in the same place before the look is applied.
  exposure: {
    target: number; // desired average brightness (0–1, linear-ish)
    minGain: number; // never darken more than this
    maxGain: number; // never brighten more than this
    highlightLimit: number; // keep the brightest 2% under this after gain
  };
  color: {
    warmth: number; // amber/golden shift (0 = neutral)
    tint: number; // + magenta / − green
    skinProtection: number; // 0–1: how much skin tones are spared from warming
    shadowTint: [number, number, number]; // color mixed into shadows
    shadowTintAmount: number;
    highlightTint: [number, number, number]; // creamy highlights
    highlightTintAmount: number;
  };
  tone: {
    contrast: number; // S-curve strength (0 = flat)
    blackLift: number; // lifted blacks: darkest value (0–1)
    whitePoint: number; // brightest value: < 1 so whites are never pure
  };
  saturation: {
    global: number; // 1 = unchanged
    reds: number; // extra depth in reds/oranges
    greens: number; // extra depth in greens
    skin: number; // keeps skin from turning orange
  };
  grain: {
    amount: number; // visible but fine
    size: number; // grain "particle" size in px at 2048px
    shadowBoost: number; // extra grain in shadows
  };
  vignette: {
    amount: number;
    softness: number; // 0 = hard edge, 1 = very gradual
  };
  halation: {
    threshold: number; // brightness where the glow starts
    radius: number; // glow spread in px at 2048px
    strength: number;
    color: [number, number, number]; // red-orange glow, like real film
  };
  edgeSoftness: {
    amount: number; // sharpness loss towards the edges
    start: number; // 0 = from the center, 1 = only the very corners
    radius: number; // blur radius in px at 2048px
  };
  lightLeak: {
    probability: number; // ~1 in 5 photos
    intensity: number;
    size: number; // how far into the frame it reaches (0–1)
    colorA: [number, number, number]; // hot core (orange)
    colorB: [number, number, number]; // outer glow (red)
  };
  dateStamp: {
    color: string;
    sizeRatio: number; // text height relative to the photo's short edge
    margin: number; // distance from the corner, relative to the short edge
  };
};

export const filmPreset: FilmPreset = {
  exposure: {
    target: 0.48,
    minGain: 0.9,
    maxGain: 1.7,
    highlightLimit: 0.83,
  },
  color: {
    warmth: 0.08,
    tint: 0.01,
    skinProtection: 0.65,
    shadowTint: [0.22, 0.13, 0.04],
    shadowTintAmount: 0.18,
    highlightTint: [1.0, 0.96, 0.88],
    highlightTintAmount: 0.3,
  },
  tone: {
    contrast: 0.16,
    blackLift: 0.06,
    whitePoint: 0.955,
  },
  saturation: {
    global: 0.88,
    reds: 1.18,
    greens: 1.1,
    skin: 0.92,
  },
  grain: {
    amount: 0.095,
    size: 1.5,
    shadowBoost: 0.85,
  },
  vignette: {
    amount: 0.22,
    softness: 0.65,
  },
  halation: {
    threshold: 0.68,
    radius: 24,
    strength: 0.4,
    color: [1.0, 0.42, 0.18],
  },
  edgeSoftness: {
    amount: 0.6,
    start: 0.55,
    radius: 6,
  },
  lightLeak: {
    probability: 0.2,
    intensity: 0.6,
    size: 0.46,
    colorA: [1.0, 0.62, 0.22],
    colorB: [0.95, 0.18, 0.08],
  },
  dateStamp: {
    color: "#ff8a1f",
    sizeRatio: 0.028,
    margin: 0.045,
  },
};
