import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BrainTipCard from "../BrainTipCard";

const brain = { id: "1", name: "My Brain", type: "personal" } as any;

describe("BrainTipCard — accessibility & touch target", () => {
  it("close button has aria-label='Dismiss tip'", () => {
    render(<BrainTipCard brain={brain} onDismiss={vi.fn()} onFill={vi.fn()} />);
    expect(screen.getByRole("button", { name: /dismiss tip/i })).toBeInTheDocument();
  });

  it("close button has min 44px touch target (w-11 h-11)", () => {
    render(<BrainTipCard brain={brain} onDismiss={vi.fn()} onFill={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /dismiss tip/i });
    expect(btn.className).toMatch(/w-11/);
    expect(btn.className).toMatch(/h-11/);
  });
});
