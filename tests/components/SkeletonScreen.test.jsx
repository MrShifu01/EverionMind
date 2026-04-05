import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "../../src/ThemeContext";
import SkeletonCard from "../../src/components/SkeletonCard";

function renderWithTheme(ui) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("SkeletonCard", () => {
  it("renders a skeleton loading placeholder", () => {
    renderWithTheme(<SkeletonCard />);
    const skeleton = screen.getByRole("status");
    expect(skeleton).toBeInTheDocument();
  });

  it("has an accessible loading label", () => {
    renderWithTheme(<SkeletonCard />);
    const skeleton = screen.getByRole("status");
    expect(skeleton).toHaveAttribute("aria-label", "Loading");
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

  it("has animated shimmer effect via animation style", () => {
    const { container } = renderWithTheme(<SkeletonCard />);
    const line = container.querySelector("[data-testid='skeleton-line']");
    expect(line.style.animation).toBeTruthy();
  });
});
