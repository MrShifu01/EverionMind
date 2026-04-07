import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "../../src/ThemeContext";
import SkeletonCard from "../../src/components/SkeletonCard";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("SkeletonCard", () => {
  it("renders a skeleton loading placeholder", () => {
    renderWithTheme(<SkeletonCard />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has an accessible loading label", () => {
    renderWithTheme(<SkeletonCard />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
  });

  it("renders multiple skeleton lines", () => {
    const { container } = renderWithTheme(<SkeletonCard />);
    const lines = container.querySelectorAll("[data-testid='skeleton-line']");
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it("renders a count of skeleton cards when count prop is provided", () => {
    const { container } = renderWithTheme(<SkeletonCard count={4} />);
    const skeletons = container.querySelectorAll("[role='status']");
    expect(skeletons.length).toBe(4);
  });

  it("has animated shimmer effect via Tailwind animate class", () => {
    const { container } = renderWithTheme(<SkeletonCard />);
    const line = container.querySelector("[data-testid='skeleton-line']") as HTMLElement;
    // Animation is now applied via Tailwind class (animate-pulse or similar) instead of inline style
    expect(line.className).toMatch(/animate-|pulse/);
  });
});
