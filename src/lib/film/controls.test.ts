import { describe, expect, it } from "vitest";
import { controlGroups, getValue, setValue } from "./controls";
import { filmPreset } from "./preset";

const controls = controlGroups.flatMap((g) => g.controls);

describe("lab controls", () => {
  it("point at numeric preset values within their slider range", () => {
    for (const c of controls) {
      const value = getValue(filmPreset, c.path);
      expect(typeof value, c.path).toBe("number");
      expect(value, c.path).toBeGreaterThanOrEqual(c.min);
      expect(value, c.path).toBeLessThanOrEqual(c.max);
    }
  });

  it("setValue changes one value without mutating the preset", () => {
    const next = setValue(filmPreset, "grain.amount", 0.1);
    expect(next.grain.amount).toBe(0.1);
    expect(next.grain.size).toBe(filmPreset.grain.size);
    expect(filmPreset.grain.amount).not.toBe(0.1);
  });
});
