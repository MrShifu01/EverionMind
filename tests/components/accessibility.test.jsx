import { describe, it, expect } from "vitest";
import { DARK, LIGHT } from "../../src/ThemeContext";

/**
 * Calculate relative luminance per WCAG 2.0 formula.
 * Input: hex color string like "#0f0f23"
 */
function luminance(hex) {
  const rgb = hex
    .replace("#", "")
    .match(/.{2}/g)
    .map((c) => {
      const v = parseInt(c, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * Calculate contrast ratio between two hex colors.
 */
function contrastRatio(hex1, hex2) {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("WCAG 2.2 Contrast Ratios", () => {
  describe("Dark theme", () => {
    it("text on bg meets 4.5:1 AA ratio", () => {
      const ratio = contrastRatio(DARK.text, DARK.bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("textMuted on bg meets 4.5:1 AA ratio", () => {
      const ratio = contrastRatio(DARK.textMuted, DARK.bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("textDim on bg meets 4.5:1 AA ratio", () => {
      const ratio = contrastRatio(DARK.textDim, DARK.bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("textFaint on bg meets 3:1 ratio for large text / non-text elements", () => {
      const ratio = contrastRatio(DARK.textFaint, DARK.bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it("accent on bg meets 3:1 for interactive elements", () => {
      const ratio = contrastRatio(DARK.accent, DARK.bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it("textMuted on surface meets 4.5:1 AA ratio", () => {
      const ratio = contrastRatio(DARK.textMuted, DARK.surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("textDim on surface meets 4.5:1 AA ratio", () => {
      const ratio = contrastRatio(DARK.textDim, DARK.surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe("Light theme", () => {
    it("text on bg meets 4.5:1 AA ratio", () => {
      const ratio = contrastRatio(LIGHT.text, LIGHT.bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("textMuted on bg meets 4.5:1 AA ratio", () => {
      const ratio = contrastRatio(LIGHT.textMuted, LIGHT.bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("textDim on bg meets 4.5:1 AA ratio", () => {
      const ratio = contrastRatio(LIGHT.textDim, LIGHT.bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("textFaint on bg meets 3:1 ratio for large text / non-text elements", () => {
      const ratio = contrastRatio(LIGHT.textFaint, LIGHT.bg);
      expect(ratio).toBeGreaterThanOrEqual(3);
    });
  });
});
