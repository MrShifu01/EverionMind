import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

const src = readFileSync(
  resolve(__dirname, "../QuickCapture.tsx"),
  "utf-8"
);

describe("QuickCapture — design token compliance", () => {
  it("no hard-coded rgba(0,0,0,0.7) scrim", () => {
    expect(src).not.toContain("rgba(0,0,0,0.7)");
  });

  it("no hard-coded #1a1919 surface color", () => {
    expect(src).not.toContain("#1a1919");
  });

  it("no hard-coded rgba(38,38,38,0.6) container color", () => {
    expect(src).not.toContain("rgba(38,38,38,0.6)");
  });

  it("multi-entry preview does not use text-white for entry titles/counts", () => {
    // text-white is a hard-coded color — should use text-on-surface instead
    // We allow text-white nowhere in the multi-preview section
    // Check by ensuring the specific multi-preview span patterns are gone
    expect(src).not.toMatch(/text-sm font-semibold text-white.*entries found/);
    expect(src).not.toMatch(/text-sm font-semibold text-white truncate/);
  });

  it("no hover:bg-white/10 glassmorphism tell", () => {
    expect(src).not.toContain("hover:bg-white/10");
  });
});
