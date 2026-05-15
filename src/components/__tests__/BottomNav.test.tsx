import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Pin VITE_FEATURE_* flags OFF for this suite so prod posture (no admin
// overrides → no Chat/Schedule slot) is reproducible regardless of .env.local.
vi.mock("../../lib/featureFlags", async () => {
  const actual =
    await vi.importActual<typeof import("../../lib/featureFlags")>("../../lib/featureFlags");
  const FEATURE_FLAGS = Object.fromEntries(
    Object.entries(actual.FEATURE_FLAGS).map(([key, val]) => [key, { ...val, prodEnabled: false }]),
  ) as unknown as typeof actual.FEATURE_FLAGS;
  return {
    ...actual,
    FEATURE_FLAGS,
    isFeatureEnabled: (key: keyof typeof FEATURE_FLAGS, flags: Record<string, boolean>) =>
      FEATURE_FLAGS[key].prodEnabled || (flags[key] ?? false),
  };
});

import BottomNav from "../BottomNav";

describe("BottomNav — FAB capture action", () => {
  it("FAB button has accessible label 'New entry'", () => {
    render(
      <BottomNav activeView="feed" onNavigate={vi.fn()} onCapture={vi.fn()} onOpenMore={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /new entry/i })).toBeInTheDocument();
  });

  it("calls onCapture when the FAB button is clicked", () => {
    const onCapture = vi.fn();
    render(
      <BottomNav
        activeView="feed"
        onNavigate={vi.fn()}
        onCapture={onCapture}
        onOpenMore={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /new entry/i }));
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it("does not call onNavigate when the FAB is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <BottomNav
        activeView="grid"
        onNavigate={onNavigate}
        onCapture={vi.fn()}
        onOpenMore={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /new entry/i }));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("calls onNavigate with the view id when a non-FAB nav item is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <BottomNav
        activeView="feed"
        onNavigate={onNavigate}
        onCapture={vi.fn()}
        onOpenMore={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^memory$/i }));
    expect(onNavigate).toHaveBeenCalledWith("memory");
  });

  it("active view item has aria-current='page'", () => {
    render(
      <BottomNav
        activeView="memory"
        onNavigate={vi.fn()}
        onCapture={vi.fn()}
        onOpenMore={vi.fn()}
      />,
    );
    const memBtn = screen.getByRole("button", { name: /^memory$/i });
    expect(memBtn).toHaveAttribute("aria-current", "page");
  });

  it("hides Chat when its flag is off", () => {
    render(
      <BottomNav
        activeView="memory"
        onNavigate={vi.fn()}
        onCapture={vi.fn()}
        onOpenMore={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^chat$/i })).toBeNull();
  });

  it("shows Chat when admin flag enables it", () => {
    render(
      <BottomNav
        activeView="memory"
        onNavigate={vi.fn()}
        onCapture={vi.fn()}
        onOpenMore={vi.fn()}
        adminFlags={{ chat: true }}
      />,
    );
    expect(screen.getByRole("button", { name: /^chat$/i })).toBeInTheDocument();
  });
});
