import { describe, it, expect } from "vitest";
import { DARK, LIGHT } from "../../src/ThemeContext";

describe("ThemeContext token integrity", () => {
  it("DARK accentContainer is a subdued container tone, not the accent itself", () => {
    expect(DARK.accentContainer).toBe("oklch(24% 0.05 75)");
  });

  it("DARK accentContainer differs from DARK accent", () => {
    expect(DARK.accentContainer).not.toBe(DARK.accent);
  });
});

// Parse oklch(L% C H) → approximate relative luminance via Y ≈ L^3
function luminanceOklch(str: string): number {
  const m = str.match(/oklch\(\s*([\d.]+)%/);
  if (!m) return NaN;
  const L = parseFloat(m[1]) / 100;
  return L * L * L;
}

function contrastRatio(oklch1: string, oklch2: string): number {
  const l1 = luminanceOklch(oklch1);
  const l2 = luminanceOklch(oklch2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("WCAG 2.2 Contrast Ratios", () => {
  describe("Dark theme", () => {
    it("text on bg meets 4.5:1 AA ratio", () => {
      expect(contrastRatio(DARK.text, DARK.bg)).toBeGreaterThanOrEqual(4.5);
    });
    it("textMuted on bg meets 4.5:1 AA ratio", () => {
      expect(contrastRatio(DARK.textMuted, DARK.bg)).toBeGreaterThanOrEqual(4.5);
    });
    it("textDim on bg meets 4.5:1 AA ratio", () => {
      expect(contrastRatio(DARK.textDim, DARK.bg)).toBeGreaterThanOrEqual(4.5);
    });
    it("textFaint on bg meets 3:1 for non-text elements", () => {
      expect(contrastRatio(DARK.textFaint, DARK.bg)).toBeGreaterThanOrEqual(3);
    });
    it("accent on bg meets 3:1 for interactive elements", () => {
      expect(contrastRatio(DARK.accent, DARK.bg)).toBeGreaterThanOrEqual(3);
    });
    it("textMuted on surface meets 4.5:1 AA ratio", () => {
      expect(contrastRatio(DARK.textMuted, DARK.surface)).toBeGreaterThanOrEqual(4.5);
    });
    it("textDim on surface meets 4.5:1 AA ratio", () => {
      expect(contrastRatio(DARK.textDim, DARK.surface)).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe("Light theme", () => {
    it("text on bg meets 4.5:1 AA ratio", () => {
      expect(contrastRatio(LIGHT.text, LIGHT.bg)).toBeGreaterThanOrEqual(4.5);
    });
    it("textMuted on bg meets 4.5:1 AA ratio", () => {
      expect(contrastRatio(LIGHT.textMuted, LIGHT.bg)).toBeGreaterThanOrEqual(4.5);
    });
    it("textDim on bg meets 4.5:1 AA ratio", () => {
      expect(contrastRatio(LIGHT.textDim, LIGHT.bg)).toBeGreaterThanOrEqual(4.5);
    });
    it("textFaint on bg meets 3:1 for non-text elements", () => {
      expect(contrastRatio(LIGHT.textFaint, LIGHT.bg)).toBeGreaterThanOrEqual(3);
    });
  });
});
