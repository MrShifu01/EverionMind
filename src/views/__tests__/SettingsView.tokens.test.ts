import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

const src = readFileSync(resolve(__dirname, "../SettingsView.tsx"), "utf-8");

describe("SettingsView — tab contrast", () => {
  it("active tab uses --color-primary for text, not --color-on-primary", () => {
    // on-primary is for text ON a primary-colored background.
    // Tab underline pattern has no primary background, so active tab
    // text must use --color-primary (the color itself) for contrast on surface.
    expect(src).not.toMatch(/activeTab.*on-primary|on-primary.*activeTab/);
  });
});
