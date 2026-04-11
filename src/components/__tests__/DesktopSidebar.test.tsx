import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DesktopSidebar from "../DesktopSidebar";

const baseProps = {
  activeBrainName: "Test Brain",
  view: "capture",
  onNavigate: vi.fn(),
  onCapture: vi.fn(),
  isDark: false,
  onToggleTheme: vi.fn(),
  isOnline: true,
  pendingCount: 0,
  entryCount: 5,
  onShowCreateBrain: vi.fn(),
  navViews: [
    { id: "grid", l: "Brains", ic: "grid" },
    { id: "suggest", l: "Suggest", ic: "suggest" },
  ],
};

describe("DesktopSidebar — SVG accessibility", () => {
  it("all SVGs inside nav buttons have aria-hidden='true'", () => {
    const { container } = render(<DesktopSidebar {...baseProps} />);
    const navButtons = container.querySelectorAll("nav button");
    navButtons.forEach((btn) => {
      const svgs = btn.querySelectorAll("svg");
      svgs.forEach((svg) => {
        expect(svg).toHaveAttribute("aria-hidden", "true");
      });
    });
  });

  it("inline SVGs in footer buttons are aria-hidden", () => {
    const { container } = render(<DesktopSidebar {...baseProps} />);
    // New Entry button and New brain button both have inline SVGs
    const footerSvgs = container.querySelectorAll(
      "aside > button svg, aside > div svg, aside > nav ~ div svg",
    );
    footerSvgs.forEach((svg) => {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    });
  });
});
