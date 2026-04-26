import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import OnboardingModal from "../OnboardingModal";

describe("OnboardingModal — structure", () => {
  it("wraps content in role=dialog with aria-modal", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("renders a Skip button", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /skip/i })).toBeInTheDocument();
  });

  it("calls onComplete when Skip is clicked", () => {
    const onComplete = vi.fn();
    render(<OnboardingModal onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("OnboardingModal — welcome step", () => {
  it("shows welcome heading on first render", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    expect(screen.getByText(/welcome in/i)).toBeInTheDocument();
  });

  it("renders a primary CTA on the welcome step", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^begin$/i })).toBeInTheDocument();
  });

  it("shows no back button on the first step", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^back$/i })).toBeNull();
  });
});

describe("OnboardingModal — capture step", () => {
  it("advancing through welcome and name reveals the capture textarea", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^begin$/i }));
    // Name step: two "skip" buttons exist (header + step CTA).
    // The step CTA sits at the bottom of the dialog and is the second one.
    const skips = screen.getAllByRole("button", { name: /^skip$/i });
    fireEvent.click(skips[skips.length - 1]);
    expect(screen.getByPlaceholderText(/call supplier/i)).toBeInTheDocument();
  });

  it("'teach my brain' button is disabled when textarea is empty", () => {
    render(<OnboardingModal onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^begin$/i }));
    const skips = screen.getAllByRole("button", { name: /^skip$/i });
    fireEvent.click(skips[skips.length - 1]);
    const btn = screen.getByRole("button", { name: /teach my brain/i });
    expect(btn).toBeDisabled();
  });
});
