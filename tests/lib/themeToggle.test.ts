/**
 * S5-4: Dark mode toggle — ThemeContext logic.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resolveTheme, persistTheme, loadPersistedTheme } from "../../src/lib/themeToggle";

describe("themeToggle utilities (S5-4)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("resolveTheme: defaults to light when no preference stored", () => {
    expect(resolveTheme(null)).toBe("light");
  });

  it("resolveTheme: returns stored preference", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("persistTheme: saves to localStorage", () => {
    persistTheme("light");
    expect(localStorage.getItem("openbrain_theme")).toBe("light");
  });

  it("loadPersistedTheme: returns null when nothing stored", () => {
    expect(loadPersistedTheme()).toBeNull();
  });

  it("loadPersistedTheme: returns stored value", () => {
    localStorage.setItem("openbrain_theme", "light");
    expect(loadPersistedTheme()).toBe("light");
  });
});
