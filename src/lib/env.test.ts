import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guards against accidentally exposing the secret key to the browser.
describe(".env.example", () => {
  const vars = readFileSync(".env.example", "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => line.split("=")[0]);

  it("never makes the secret key public", () => {
    expect(vars).toContain("SUPABASE_SECRET_KEY");
    expect(vars.filter((v) => v.startsWith("NEXT_PUBLIC_") && v.includes("SECRET"))).toEqual([]);
  });
});
