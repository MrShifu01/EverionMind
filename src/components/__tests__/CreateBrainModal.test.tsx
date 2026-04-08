import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

const src = readFileSync(
  resolve(__dirname, "../CreateBrainModal.tsx"),
  "utf-8"
);

describe("CreateBrainModal — design token compliance", () => {
  it("brain name input does not reference Inter font", () => {
    expect(src).not.toMatch(/fontFamily.*Inter/);
  });
});
