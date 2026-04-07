import { describe, it, expect, vi } from "vitest";
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
  brain_id: null,
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
    // The scrollable body must NOT contain the close/edit buttons — they live in
    // a non-scrolling header sibling so they stay visible on long entries.
    const scrollBody = container.querySelector("[data-testid='detail-scroll-body']") as HTMLElement;
    expect(scrollBody).not.toBeNull();
    // Close button must NOT be inside the scroll body
    const closeBtn = container.querySelector("button[aria-label='Close']") as HTMLElement;
    expect(closeBtn).not.toBeNull();
    expect(scrollBody.contains(closeBtn)).toBe(false);
  });
});

describe("DetailModal — bottom nav clearance", () => {
  it("overlay paddingBottom clears the bottom nav (>= 96px + safe area)", () => {
    const { container } = renderModal();
    // The outermost fixed overlay div carries the paddingBottom style
    const overlay = container.querySelector(".fixed.inset-0") as HTMLElement;
    expect(overlay).not.toBeNull();
    const pb = overlay.style.paddingBottom;
    // Must use at least 96px so content clears the fixed bottom nav bar
    // (nav is bottom-5 = 20px + ~72px height = ~92px from viewport bottom)
    const match = pb.match(/(\d+)px/);
    expect(match).not.toBeNull();
    const pixels = parseInt(match![1], 10);
    expect(pixels).toBeGreaterThanOrEqual(96);
  });
});
