import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BottomNav from "../../src/components/BottomNav";
import { ThemeProvider } from "../../src/ThemeContext";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("BottomNav", () => {
  it("renders 5 primary navigation items", () => {
    renderWithTheme(<BottomNav activeView="capture" onNavigate={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: /main/i });
    const buttons = nav.querySelectorAll("button");
    expect(buttons.length).toBe(5);
  });

  it("contains Capture, Grid, Fill Brain, Ask, and More items", () => {
    renderWithTheme(<BottomNav activeView="capture" onNavigate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /capture/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /grid/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fill brain/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more/i })).toBeInTheDocument();
  });

  it("all touch targets have adequate min-height class for touch target", () => {
    const { container } = renderWithTheme(<BottomNav activeView="capture" onNavigate={vi.fn()} />);
    const buttons = container.querySelectorAll("button");
    buttons.forEach((btn) => {
      expect(btn.className).toMatch(/min-h-1[2-9]|min-h-[2-9]\d/);
    });
  });

  it("marks the active view with aria-current='page'", () => {
    renderWithTheme(<BottomNav activeView="grid" onNavigate={vi.fn()} />);
    const gridBtn = screen.getByRole("button", { name: /grid/i });
    expect(gridBtn).toHaveAttribute("aria-current", "page");
  });

  it("non-active items do not have aria-current", () => {
    renderWithTheme(<BottomNav activeView="grid" onNavigate={vi.fn()} />);
    const captureBtn = screen.getByRole("button", { name: /capture/i });
    expect(captureBtn).not.toHaveAttribute("aria-current", "page");
  });

  it("calls onNavigate with the correct view id on click", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderWithTheme(<BottomNav activeView="capture" onNavigate={onNavigate} />);
    await user.click(screen.getByRole("button", { name: /grid/i }));
    expect(onNavigate).toHaveBeenCalledWith("grid");
  });

  it("is fixed to the bottom of the viewport", () => {
    const { container } = renderWithTheme(<BottomNav activeView="capture" onNavigate={vi.fn()} />);
    const nav = container.querySelector("nav");
    expect(nav!.className).toMatch(/fixed/);
    expect(nav!.className).toMatch(/bottom-0/);
  });

  it("has a proper navigation landmark with accessible name", () => {
    renderWithTheme(<BottomNav activeView="capture" onNavigate={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: /main/i })).toBeInTheDocument();
  });
});
