import { describe, expect, it } from "vitest";
import { isValidSlug } from "./events";

describe("isValidSlug", () => {
  it("accepts lowercase alphanumeric slugs of 10–32 chars", () => {
    expect(isValidSlug("k3x9abcd12")).toBe(true);
    expect(isValidSlug("a".repeat(32))).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidSlug("short")).toBe(false);
    expect(isValidSlug("a".repeat(33))).toBe(false);
    expect(isValidSlug("UPPERCASE12")).toBe(false);
    expect(isValidSlug("with-dash-123")).toBe(false);
    expect(isValidSlug("../../etc/passwd")).toBe(false);
  });
});
