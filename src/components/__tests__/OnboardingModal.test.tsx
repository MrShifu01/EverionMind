import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import OnboardingModal from "../OnboardingModal";

describe("OnboardingModal — accessibility", () => {
  it("wraps content in role=dialog with aria-modal", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("use-case toggle buttons use aria-pressed, not role=checkbox", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    // Advance past the trust intro to the use-case step
    const getStarted = screen.getByRole("button", { name: /get started/i });
    fireEvent.click(getStarted);

    const allButtons = screen.getAllByRole("button");
    allButtons.forEach((btn) => {
      expect(btn).not.toHaveAttribute("role", "checkbox");
    });
    const pressedButtons = allButtons.filter((b) => b.hasAttribute("aria-pressed"));
    expect(pressedButtons.length).toBeGreaterThanOrEqual(3);
  });

  it("does not render a decorative emoji div above the heading", () => {
    const { container } = render(<OnboardingModal onComplete={vi.fn()} />);
    const emojiDivs = container.querySelectorAll(".text-4xl");
    expect(emojiDivs.length).toBe(0);
  });
});

describe("OnboardingModal — use-case button descriptions", () => {
  it("each use-case button has aria-describedby linked to its description text", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    const pressedButtons = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-pressed"));

    pressedButtons.forEach((btn) => {
      const describedById = btn.getAttribute("aria-describedby");
      expect(describedById).toBeTruthy();
      const descEl = document.getElementById(describedById!);
      expect(descEl).toBeInTheDocument();
      expect(descEl!.textContent).toBeTruthy();
    });
  });
});

describe("OnboardingModal — trust intro (step 0)", () => {
  it("shows trust intro on first render — use-case buttons not yet visible", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    // No aria-pressed buttons on step 0 (they belong to the use-case step)
    const pressedButtons = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-pressed"));
    expect(pressedButtons.length).toBe(0);
  });

  it("renders a 'Get started' CTA on the trust intro step", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
  });

  it("shows no back button on the first step", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /back/i })).toBeNull();
  });

  it("advancing from trust intro reveals use-case selection", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    const pressedButtons = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-pressed"));
    expect(pressedButtons.length).toBeGreaterThanOrEqual(3);
  });
});
