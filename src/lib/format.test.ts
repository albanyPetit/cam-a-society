import { describe, expect, it } from "vitest";
import { formatWhen } from "./format";

// Local-time dates, so the test passes in any time zone.
const now = new Date(2026, 9, 28, 10, 0);
const at = (day: number, h: number, m = 0) =>
  new Date(2026, 9, day, h, m).toISOString();

describe("formatWhen", () => {
  it("says today / tomorrow for nearby dates", () => {
    expect(formatWhen(at(28, 18, 5), now)).toBe("today at 18:05");
    expect(formatWhen(at(29, 9, 30), now)).toBe("tomorrow at 09:30");
  });

  it("spells out other dates with a 24-hour time", () => {
    expect(formatWhen(at(31, 20), now)).toBe("Saturday 31 October at 20:00");
  });
});
