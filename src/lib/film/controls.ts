// Slider definitions for /lab: one per numeric preset value.
import type { FilmPreset } from "./preset";

export type Control = {
  path: string; // e.g. "grain.amount"
  label: string;
  min: number;
  max: number;
  step: number;
};

export type ControlGroup = { title: string; controls: Control[] };

export const controlGroups: ControlGroup[] = [
  {
    title: "Exposure",
    controls: [
      {
        path: "exposure.target",
        label: "Target brightness",
        min: 0.2,
        max: 0.65,
        step: 0.01,
      },
      {
        path: "exposure.minGain",
        label: "Max darkening",
        min: 0.4,
        max: 1,
        step: 0.05,
      },
      {
        path: "exposure.maxGain",
        label: "Max brightening",
        min: 1,
        max: 4,
        step: 0.1,
      },
      {
        path: "exposure.highlightLimit",
        label: "Highlight limit",
        min: 0.8,
        max: 1,
        step: 0.01,
      },
    ],
  },
  {
    title: "Color",
    controls: [
      { path: "color.warmth", label: "Warmth", min: 0, max: 0.3, step: 0.005 },
      {
        path: "color.tint",
        label: "Tint (green ↔ magenta)",
        min: -0.08,
        max: 0.08,
        step: 0.005,
      },
      {
        path: "color.skinProtection",
        label: "Skin protection",
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        path: "color.shadowTintAmount",
        label: "Amber shadows",
        min: 0,
        max: 0.6,
        step: 0.01,
      },
      {
        path: "color.highlightTintAmount",
        label: "Creamy highlights",
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
  },
  {
    title: "Tone",
    controls: [
      {
        path: "tone.contrast",
        label: "Contrast (S-curve)",
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        path: "tone.blackLift",
        label: "Lifted blacks",
        min: 0,
        max: 0.2,
        step: 0.005,
      },
      {
        path: "tone.whitePoint",
        label: "White point",
        min: 0.85,
        max: 1,
        step: 0.005,
      },
    ],
  },
  {
    title: "Saturation",
    controls: [
      {
        path: "saturation.global",
        label: "Overall",
        min: 0.4,
        max: 1.4,
        step: 0.01,
      },
      {
        path: "saturation.reds",
        label: "Reds",
        min: 0.6,
        max: 1.6,
        step: 0.01,
      },
      {
        path: "saturation.greens",
        label: "Greens",
        min: 0.6,
        max: 1.6,
        step: 0.01,
      },
      {
        path: "saturation.skin",
        label: "Skin",
        min: 0.5,
        max: 1.3,
        step: 0.01,
      },
    ],
  },
  {
    title: "Grain",
    controls: [
      { path: "grain.amount", label: "Amount", min: 0, max: 0.2, step: 0.005 },
      { path: "grain.size", label: "Size", min: 0.6, max: 4, step: 0.1 },
      {
        path: "grain.shadowBoost",
        label: "Extra in shadows",
        min: 0,
        max: 2,
        step: 0.05,
      },
    ],
  },
  {
    title: "Vignette",
    controls: [
      {
        path: "vignette.amount",
        label: "Amount",
        min: 0,
        max: 0.7,
        step: 0.01,
      },
      {
        path: "vignette.softness",
        label: "Softness",
        min: 0.1,
        max: 1,
        step: 0.01,
      },
    ],
  },
  {
    title: "Halation",
    controls: [
      {
        path: "halation.threshold",
        label: "Starts at brightness",
        min: 0.4,
        max: 0.98,
        step: 0.01,
      },
      {
        path: "halation.radius",
        label: "Spread (px)",
        min: 4,
        max: 80,
        step: 1,
      },
      {
        path: "halation.strength",
        label: "Strength",
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
  },
  {
    title: "Edges",
    controls: [
      {
        path: "edgeSoftness.amount",
        label: "Softness",
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        path: "edgeSoftness.start",
        label: "Starts at",
        min: 0.2,
        max: 0.95,
        step: 0.01,
      },
      {
        path: "edgeSoftness.radius",
        label: "Blur (px)",
        min: 1,
        max: 24,
        step: 0.5,
      },
    ],
  },
  {
    title: "Light leak",
    controls: [
      {
        path: "lightLeak.probability",
        label: "Probability",
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        path: "lightLeak.intensity",
        label: "Intensity",
        min: 0,
        max: 1,
        step: 0.01,
      },
      { path: "lightLeak.size", label: "Reach", min: 0.1, max: 1, step: 0.01 },
    ],
  },
  {
    title: "Date stamp",
    controls: [
      {
        path: "dateStamp.sizeRatio",
        label: "Size",
        min: 0.02,
        max: 0.1,
        step: 0.002,
      },
      {
        path: "dateStamp.margin",
        label: "Margin",
        min: 0.01,
        max: 0.1,
        step: 0.002,
      },
    ],
  },
];

export function getValue(preset: FilmPreset, path: string): number {
  const [group, key] = path.split(".");
  return (preset as unknown as Record<string, Record<string, number>>)[group][
    key
  ];
}

// Returns a new preset with one value changed.
export function setValue(
  preset: FilmPreset,
  path: string,
  value: number,
): FilmPreset {
  const [group, key] = path.split(".") as [keyof FilmPreset, string];
  return { ...preset, [group]: { ...preset[group], [key]: value } };
}
