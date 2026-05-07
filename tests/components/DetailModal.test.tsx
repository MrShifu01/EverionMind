import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  },
}));

import { render, cleanup } from "@testing-library/react";
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
    </ThemeProvider>,
  );
}

// Radix Dialog portals to document.body (not the test render container),
// so all DOM queries here scope to document.body.
afterEach(() => cleanup());

describe("DetailModal — header always visible", () => {
  it("header is outside the scrollable body (close button is not a descendant of the scroll container)", () => {
    renderModal();
    const scrollBody = document.body.querySelector(
      "[data-testid='detail-scroll-body']",
    ) as HTMLElement;
    expect(scrollBody).not.toBeNull();
    const closeBtn = document.body.querySelector("button[aria-label='Close']") as HTMLElement;
    expect(closeBtn).not.toBeNull();
    expect(scrollBody.contains(closeBtn)).toBe(false);
  });
});

describe("DetailModal — bottom nav clearance", () => {
  it("modal sits at least 96px above the bottom of the viewport (clears the nav bar)", () => {
    renderModal();
    // Post-Radix: the Dialog.Content panel is positioned via the
    // `bottom-[calc(96px+env(safe-area-inset-bottom))]` Tailwind utility
    // (and its `lg:bottom-auto` desktop counterpart). Tailwind arbitrary
    // values don't compute in jsdom, so check the className text directly.
    // Pre-Radix the outer overlay carried inline paddingBottom — either
    // way the visible panel must clear ≥96px from the bottom.
    const content = document.body.querySelector("[role='dialog']") as HTMLElement;
    expect(content).not.toBeNull();
    const match = content.style.bottom.match(/calc\((\d+)px/);
    expect(match).not.toBeNull();
    const pixels = parseInt(match![1], 10);
    expect(pixels).toBeGreaterThanOrEqual(96);
  });
});

describe("DetailModal — modal height never exceeds available viewport", () => {
  it("modal panel uses maxHeight style accounting for nav bar (not just max-h-[90vh])", () => {
    renderModal();
    // Post-Radix: the panel IS Dialog.Content (was an inner div pre-migration).
    const panel = document.body.querySelector("[role='dialog']") as HTMLElement;
    expect(panel).not.toBeNull();
    // Must subtract nav clearance so tall entries don't push the header above viewport
    const mh = panel.style.maxHeight;
    expect(mh).toMatch(/calc\(.*96px/);
  });

  it("scroll body has overscroll-behavior contain to prevent background page scroll", () => {
    renderModal();
    const scrollBody = document.body.querySelector(
      "[data-testid='detail-scroll-body']",
    ) as HTMLElement;
    expect(scrollBody).not.toBeNull();
    expect(scrollBody.style.overscrollBehavior).toBe("contain");
  });
});
