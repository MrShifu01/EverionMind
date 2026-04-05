import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../../src/ThemeContext";
import OnboardingModal from "../../src/components/OnboardingModal";

function renderWithTheme(ui) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("OnboardingModal — Streamlined Flow", () => {
  it("has at most 3 visible progress steps (excluding iOS)", () => {
    renderWithTheme(<OnboardingModal onComplete={vi.fn()} />);
    // The progress dots should have at most 3 steps (or 4 if iOS step is included)
    const tabs = screen.getAllByRole("tab");
    // Filter out iOS step — on non-iOS devices, should be max 3
    expect(tabs.length).toBeLessThanOrEqual(3);
  });

  it("can reach completion within 3 taps from start", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderWithTheme(<OnboardingModal onComplete={onComplete} />);

    // Tap 1: select use case and proceed
    const nextBtn1 = screen.getByRole("button", { name: /set up|next|continue|get started/i });
    await user.click(nextBtn1);

    // Tap 2: skip or proceed through questions
    const skipOrNext = screen.queryByRole("button", { name: /skip|start capturing|let.*go/i });
    if (skipOrNext) await user.click(skipOrNext);

    // Tap 3: final start
    const startBtn = screen.queryByRole("button", { name: /start capturing|let.*go|done/i });
    if (startBtn) await user.click(startBtn);

    expect(onComplete).toHaveBeenCalled();
  });
});
