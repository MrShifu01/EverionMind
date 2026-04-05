import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BottomNav from "../../src/components/BottomNav";
import { ThemeProvider } from "../../src/ThemeContext";

function renderWithTheme(ui) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const defaultProps = {
  activeView: "capture",
  onNavigate: vi.fn(),
};

describe("BottomNav", () => {
  it("renders 5 primary navigation items", () => {
    renderWithTheme(<BottomNav {...defaultProps} />);
    const nav = screen.getByRole("navigation", { name: /main/i });
    const buttons = nav.querySelectorAll("button");
    expect(buttons.length).toBe(5);
  });

  it("contains Capture, Grid, Fill Brain, Ask, and More items", () => {
    renderWithTheme(<BottomNav {...defaultProps} />);
    expect(screen.getByRole("button", { name: /capture/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /grid/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fill brain/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more/i })).toBeInTheDocument();
  });

  it("all touch targets are at least 48px tall", () => {
    const { container } = renderWithTheme(<BottomNav {...defaultProps} />);
    const buttons = container.querySelectorAll("button");
    buttons.forEach((btn) => {
      const style = btn.style;
      const minHeight = parseInt(style.minHeight, 10);
      expect(minHeight).toBeGreaterThanOrEqual(48);
    });
  });

  it("marks the active view with aria-current='page'", () => {
    renderWithTheme(<BottomNav {...defaultProps} activeView="grid" />);
    const gridBtn = screen.getByRole("button", { name: /grid/i });
    expect(gridBtn).toHaveAttribute("aria-current", "page");
  });

  it("non-active items do not have aria-current", () => {
    renderWithTheme(<BottomNav {...defaultProps} activeView="grid" />);
    const captureBtn = screen.getByRole("button", { name: /capture/i });
    expect(captureBtn).not.toHaveAttribute("aria-current", "page");
  });

  it("calls onNavigate with the correct view id on click", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithTheme(<BottomNav activeView="capture" onNavigate={onNavigate} />);
    const gridBtn = screen.getByRole("button", { name: /grid/i });
    await user.click(gridBtn);
    expect(onNavigate).toHaveBeenCalledWith("grid");
  });

  it("is fixed to the bottom of the viewport", () => {
    const { container } = renderWithTheme(<BottomNav {...defaultProps} />);
    const nav = container.querySelector("nav");
    expect(nav.style.position).toBe("fixed");
    expect(nav.style.bottom).toBe("0px");
  });

  it("has a proper navigation landmark with accessible name", () => {
    renderWithTheme(<BottomNav {...defaultProps} />);
    const nav = screen.getByRole("navigation", { name: /main/i });
    expect(nav).toBeInTheDocument();
  });
});
