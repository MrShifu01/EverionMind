import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "../../src/ErrorBoundary";

function Bomb(): never {
  throw new Error("Test crash");
}

describe("ErrorBoundary", () => {
  it("renders error UI when child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it("decorative icon is hidden from screen readers", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    const iconWrap = container.querySelector('[aria-hidden="true"]');
    expect(iconWrap).not.toBeNull();
    // The decorative icon is an inline brain SVG.
    expect(iconWrap?.querySelector("svg")).not.toBeNull();
    spy.mockRestore();
  });
});
