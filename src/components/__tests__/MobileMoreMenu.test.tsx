import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DesignThemeProvider } from "../../design/DesignThemeContext";

// Pin all VITE_FEATURE_* flags OFF for this suite so the prod posture is
// reproducible regardless of the developer's .env.local. Tests then opt
// items in via the adminFlags prop.
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

import MobileMoreMenu from "../MobileMoreMenu";

// MobileMoreMenu is now a Radix Sheet — content portals to document.body and
// only renders when open. Visibility is governed by Radix' open state, not
// translate-* classes. The component reads design tokens via useDesignTheme
// so the provider has to wrap each render.
function renderMenu(ui: React.ReactElement) {
  return render(<DesignThemeProvider>{ui}</DesignThemeProvider>);
}

// Pre-launch flag posture is OFF for chat / todos / vault / important — the
// menu hides items whose flag is off so we don't render dead nav. Tests that
// assert on those items pass adminFlags to flip the relevant flag on.
const ALL_ON = { chat: true, todos: true, lists: true, importantMemories: true, vault: true };

describe("MobileMoreMenu", () => {
  it("does not render content when closed", () => {
    renderMenu(<MobileMoreMenu isOpen={false} onNavigate={vi.fn()} adminFlags={ALL_ON} />);
    expect(screen.queryByText("Vault")).toBeNull();
  });

  it("renders content when open", () => {
    renderMenu(<MobileMoreMenu isOpen={true} onNavigate={vi.fn()} adminFlags={ALL_ON} />);
    expect(screen.getByText("Vault")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("hides flag-gated items by default", () => {
    renderMenu(<MobileMoreMenu isOpen={true} onNavigate={vi.fn()} />);
    expect(screen.queryByText("Vault")).toBeNull();
    expect(screen.queryByText("Chat")).toBeNull();
    expect(screen.queryByText("Schedule")).toBeNull();
    expect(screen.queryByText("Lists")).toBeNull();
    expect(screen.queryByText("Important")).toBeNull();
    // Always-on items remain visible.
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("calls onNavigate with 'vault' when Vault button is clicked", () => {
    const onNavigate = vi.fn();
    renderMenu(<MobileMoreMenu isOpen={true} onNavigate={onNavigate} adminFlags={ALL_ON} />);
    fireEvent.click(screen.getByText("Vault"));
    expect(onNavigate).toHaveBeenCalledWith("vault");
  });

  it("calls onNavigate with 'settings' when Settings button is clicked", () => {
    const onNavigate = vi.fn();
    renderMenu(<MobileMoreMenu isOpen={true} onNavigate={onNavigate} adminFlags={ALL_ON} />);
    fireEvent.click(screen.getByText("Settings"));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("calls onNavigate with 'close' when sheet is dismissed", () => {
    const onNavigate = vi.fn();
    renderMenu(<MobileMoreMenu isOpen={true} onNavigate={onNavigate} adminFlags={ALL_ON} />);
    // Pressing Escape triggers Radix' onOpenChange(false), which our wrapper
    // forwards as onNavigate("close").
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onNavigate).toHaveBeenCalledWith("close");
  });
});
