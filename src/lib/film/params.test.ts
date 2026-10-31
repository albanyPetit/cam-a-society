import { describe, expect, it } from "vitest";
import {
  computeExposureGain,
  formatDateStamp,
  pickLightLeak,
  toLinear,
} from "./params";
import { filmPreset } from "./preset";

// Fixed values, so tuning the real preset in /lab never breaks these tests.
const exposure = {
  target: 0.48,
  minGain: 0.75,
  maxGain: 2.4,
  highlightLimit: 0.97,
};
const fill = (value: number, n = 400) => new Array(n).fill(value);

describe("computeExposureGain", () => {
  it("brightens a dim interior", () => {
    expect(computeExposureGain(fill(0.03), exposure)).toBeGreaterThan(1.5);
  });

  it("slightly darkens a bright, flat outdoor shot", () => {
    expect(computeExposureGain(fill(0.6), exposure)).toBeLessThan(1);
  });

  it("leaves a well exposed photo nearly alone", () => {
    const gain = computeExposureGain(fill(toLinear(exposure.target)), exposure);
    expect(gain).toBeCloseTo(1, 1);
  });

  it("stays within the preset's limits", () => {
    expect(computeExposureGain(fill(0.0001), exposure)).toBe(exposure.maxGain);
    expect(computeExposureGain(fill(1), exposure)).toBe(exposure.minGain);
  });

  it("doesn't blow out highlights when brightening", () => {
    // Mostly dark, with a bright window.
    const lum = [...fill(0.02, 380), ...fill(0.8, 20)];
    const gain = computeExposureGain(lum, exposure);
    expect(0.8 * gain).toBeLessThanOrEqual(toLinear(exposure.highlightLimit));
  });
});

describe("pickLightLeak", () => {
  it("is deterministic for a seed", () => {
    expect(pickLightLeak(42, filmPreset.lightLeak)).toEqual(
      pickLightLeak(42, filmPreset.lightLeak),
    );
  });

  it("happens in roughly 1 of 5 photos", () => {
    let leaks = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      if (pickLightLeak(seed, filmPreset.lightLeak)) leaks++;
    }
    expect(leaks / 2000).toBeGreaterThan(0.16);
    expect(leaks / 2000).toBeLessThan(0.24);
  });

  it("never happens with probability 0", () => {
    const off = { ...filmPreset.lightLeak, probability: 0 };
    expect(pickLightLeak(7, off)).toBeNull();
  });
});

describe("formatDateStamp", () => {
  it("looks like a 90s camera stamp", () => {
    expect(formatDateStamp(new Date(2026, 9, 31))).toBe("'26 10 31");
    expect(formatDateStamp(new Date(2027, 0, 5))).toBe("'27 01 05");
  });
});
