import { describe, expect, it } from "vitest";
import { centerCrop, filmAspect, fitWithin } from "./frame";

describe("filmAspect", () => {
  it("is 3:2 for landscape and 2:3 for portrait", () => {
    expect(filmAspect(1920, 1080)).toBe(3 / 2);
    expect(filmAspect(1080, 1920)).toBe(2 / 3);
  });
});

describe("centerCrop", () => {
  it("trims the sides of a wide 16:9 frame to 3:2", () => {
    expect(centerCrop(1920, 1080, 3 / 2)).toEqual({
      sx: 150,
      sy: 0,
      sw: 1620,
      sh: 1080,
    });
  });

  it("trims top and bottom of a tall 9:16 frame to 2:3", () => {
    expect(centerCrop(1080, 1920, 2 / 3)).toEqual({
      sx: 0,
      sy: 150,
      sw: 1080,
      sh: 1620,
    });
  });

  it("keeps a frame that already has the target aspect", () => {
    expect(centerCrop(3000, 2000, 3 / 2)).toEqual({
      sx: 0,
      sy: 0,
      sw: 3000,
      sh: 2000,
    });
  });
});

describe("fitWithin", () => {
  it("scales the longest edge down to the limit", () => {
    expect(fitWithin(4032, 2688, 2048)).toEqual({ width: 2048, height: 1365 });
    expect(fitWithin(2688, 4032, 2048)).toEqual({ width: 1365, height: 2048 });
  });

  it("never scales up", () => {
    expect(fitWithin(1200, 800, 2048)).toEqual({ width: 1200, height: 800 });
  });
});
