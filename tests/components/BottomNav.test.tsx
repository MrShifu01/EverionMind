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
    const nav = screen.getByRole("navigation", { name: /primary navigation/i });
    const buttons = nav.querySelectorAll("button");
    expect(buttons.length).toBe(5);
  });

  it("contains Home, Grid, Fill Brain, Ask, and More items", () => {
    renderWithTheme(<BottomNav activeView="capture" onNavigate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /grid/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fill brain/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more/i })).toBeInTheDocument();
  });

  it("all touch targets are at least 44px (h-11 or larger)", () => {
    const { container } = renderWithTheme(<BottomNav activeView="capture" onNavigate={vi.fn()} />);
    const buttons = container.querySelectorAll("button");
    buttons.forEach((btn) => {
      // h-14 = 56px, w-14 = 56px — both exceed the 44px minimum
      expect(btn.className).toMatch(/h-1[1-9]|h-[2-9]\d|w-1[1-9]|w-[2-9]\d/);
    });
  });

  it("marks the active view with aria-current='page'", () => {
    renderWithTheme(<BottomNav activeView="grid" onNavigate={vi.fn()} />);
    const gridBtn = screen.getByRole("button", { name: /grid/i });
    expect(gridBtn).toHaveAttribute("aria-current", "page");
  });

  it("non-active items do not have aria-current", () => {
    renderWithTheme(<BottomNav activeView="grid" onNavigate={vi.fn()} />);
    const homeBtn = screen.getByRole("button", { name: /home/i });
    expect(homeBtn).not.toHaveAttribute("aria-current", "page");
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
    expect(nav!.className).toMatch(/bottom-/);
  });

  it("has a proper navigation landmark with accessible name", () => {
    renderWithTheme(<BottomNav activeView="capture" onNavigate={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: /primary navigation/i })).toBeInTheDocument();
  });
});
