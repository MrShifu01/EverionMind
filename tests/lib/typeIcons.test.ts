import { describe, it, expect, beforeEach } from "vitest";

// localStorage mock is provided by jsdom

import {
  getTypeIcons,
  registerTypeIcon,
  pickDefaultIcon,
  resolveIcon,
} from "../../src/lib/typeIcons";

const BRAIN = "brain-abc";

beforeEach(() => {
  localStorage.clear();
});

describe("getTypeIcons", () => {
  it("returns empty object when nothing stored", () => {
    expect(getTypeIcons(BRAIN)).toEqual({});
  });

  it("returns empty object for empty brainId", () => {
    expect(getTypeIcons("")).toEqual({});
  });

  it("returns stored map", () => {
    localStorage.setItem(`ob:typeIcons:${BRAIN}`, JSON.stringify({ recipe: "🍳" }));
    expect(getTypeIcons(BRAIN)).toEqual({ recipe: "🍳" });
  });
});

describe("registerTypeIcon", () => {
  it("stores icon for a new type", () => {
    registerTypeIcon(BRAIN, "recipe", "🍳");
    expect(getTypeIcons(BRAIN)).toEqual({ recipe: "🍳" });
  });

  it("does NOT overwrite an existing type icon (first-one-wins consistency)", () => {
    registerTypeIcon(BRAIN, "recipe", "🍳");
    registerTypeIcon(BRAIN, "recipe", "🌮"); // second attempt should be ignored
    expect(getTypeIcons(BRAIN).recipe).toBe("🍳");
  });

  it("stores icons for multiple different types independently", () => {
    registerTypeIcon(BRAIN, "recipe", "🍳");
    registerTypeIcon(BRAIN, "supplier", "📦");
    const map = getTypeIcons(BRAIN);
    expect(map.recipe).toBe("🍳");
    expect(map.supplier).toBe("📦");
  });

  it("does nothing for empty brainId", () => {
    registerTypeIcon("", "recipe", "🍳");
    expect(localStorage.length).toBe(0);
  });

  it("is isolated per brain — different brains have independent maps", () => {
    registerTypeIcon("brain-1", "recipe", "🍳");
    registerTypeIcon("brain-2", "recipe", "🥘");
    expect(getTypeIcons("brain-1").recipe).toBe("🍳");
    expect(getTypeIcons("brain-2").recipe).toBe("🥘");
  });
});

describe("pickDefaultIcon", () => {
  it("returns TC icon for well-known types", () => {
    expect(pickDefaultIcon("note")).toBe("📝");
    expect(pickDefaultIcon("person")).toBe("👤");
    expect(pickDefaultIcon("place")).toBe("📍");
    expect(pickDefaultIcon("reminder")).toBe("⏰");
  });

  it("returns a relevant emoji for common custom types", () => {
    expect(pickDefaultIcon("recipe")).toBe("🍳");
    expect(pickDefaultIcon("supplier")).toBe("📦");
    expect(pickDefaultIcon("vehicle")).toBe("🚗");
    expect(pickDefaultIcon("contract")).toBe("📋");
  });

  it("returns note emoji as fallback for unknown types", () => {
    expect(pickDefaultIcon("xyzunknown")).toBe("📝");
  });
});

describe("resolveIcon", () => {
  it("returns icon from typeIcons map when available", () => {
    expect(resolveIcon("recipe", { recipe: "🍳" })).toBe("🍳");
  });

  it("falls back to TC icon for well-known types not in typeIcons", () => {
    expect(resolveIcon("note", {})).toBe("📝");
    expect(resolveIcon("person", {})).toBe("👤");
  });

  it("falls back to note icon for completely unknown types", () => {
    expect(resolveIcon("xyzunknown", {})).toBe("📝");
  });

  it("typeIcons map takes priority over TC for a type that exists in both", () => {
    // If someone registered a custom icon for a well-known type, respect it
    expect(resolveIcon("note", { note: "✏️" })).toBe("✏️");
  });
});
