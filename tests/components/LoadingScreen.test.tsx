import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LoadingScreen from "../../src/components/LoadingScreen";

describe("LoadingScreen", () => {
  it("renders the Everion brand name", () => {
    render(<LoadingScreen />);
    expect(screen.getByText("EverionMind")).toBeInTheDocument();
  });

  it("renders the animated loading bar", () => {
    const { container } = render(<LoadingScreen />);
    const bar = container.querySelector("[style*='loading-sweep']");
    expect(bar).toBeInTheDocument();
  });
});
