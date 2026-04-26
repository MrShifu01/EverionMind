import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    auth: { onAuthStateChange: vi.fn(), getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  },
}));

import { render } from "@testing-library/react";
import DetailModal from "../../src/views/DetailModal";
import { ThemeProvider } from "../../src/ThemeContext";
import type { Entry } from "../../src/types";

const mockEntry: Entry = {
  id: "1",
  title: "Chilli Spice Mix",
  content: "A homemade spice blend.",
  type: "note",
  tags: ["spice", "recipe"],
  brain_id: undefined,
  metadata: {},
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

function renderModal() {
  return render(
    <ThemeProvider>
      <DetailModal entry={mockEntry} onClose={vi.fn()} />
    </ThemeProvider>
  );
}

describe("DetailModal — header always visible", () => {
  it("header is outside the scrollable body (close button is not a descendant of the scroll container)", () => {
    const { container } = renderModal();
    const scrollBody = container.querySelector("[data-testid='detail-scroll-body']") as HTMLElement;
    expect(scrollBody).not.toBeNull();
    const closeBtn = container.querySelector("button[aria-label='Close']") as HTMLElement;
    expect(closeBtn).not.toBeNull();
    expect(scrollBody.contains(closeBtn)).toBe(false);
  });
});

describe("DetailModal — bottom nav clearance", () => {
  it("overlay paddingBottom clears the bottom nav (>= 96px + safe area)", () => {
    const { container } = renderModal();
    const overlay = container.querySelector(".fixed.inset-0") as HTMLElement;
    expect(overlay).not.toBeNull();
    const pb = overlay.style.paddingBottom;
    const match = pb.match(/(\d+)px/);
    expect(match).not.toBeNull();
    const pixels = parseInt(match![1], 10);
    expect(pixels).toBeGreaterThanOrEqual(96);
  });
});

describe("DetailModal — modal height never exceeds available viewport", () => {
  it("inner modal uses maxHeight style accounting for nav bar (not just max-h-[90vh])", () => {
    const { container } = renderModal();
    const inner = container.querySelector(".fixed.inset-0 > div") as HTMLElement;
    expect(inner).not.toBeNull();
    // Must subtract nav clearance so tall entries don't push the header above viewport
    const mh = inner.style.maxHeight;
    expect(mh).toMatch(/calc\(.*96px/);
  });

  it("scroll body has overscroll-behavior contain to prevent background page scroll", () => {
    const { container } = renderModal();
    const scrollBody = container.querySelector("[data-testid='detail-scroll-body']") as HTMLElement;
    expect(scrollBody).not.toBeNull();
    expect(scrollBody.style.overscrollBehavior).toBe("contain");
  });
});
