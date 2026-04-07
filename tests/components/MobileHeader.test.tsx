import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "../../src/ThemeContext";
import MobileHeader from "../../src/components/MobileHeader";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("MobileHeader", () => {
  const defaultProps = {
    brainName: "Personal",
    brainEmoji: "\uD83E\uDDE0",
    onToggleTheme: vi.fn(),
    isDark: true,
    isOnline: true,
    pendingCount: 0,
  };

  it("renders the brain name", () => {
    renderWithTheme(<MobileHeader {...defaultProps} />);
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("renders a header element with banner role", () => {
    renderWithTheme(<MobileHeader {...defaultProps} />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("all touch targets have min-h-11 class for 44px touch target", () => {
    const { container } = renderWithTheme(<MobileHeader {...defaultProps} />);
    const buttons = container.querySelectorAll("button");
    buttons.forEach((btn) => {
      expect(btn.className).toMatch(/min-h-11|min-w-11|w-11|h-11/);
    });
  });

  it("shows offline indicator when not online", () => {
    renderWithTheme(<MobileHeader {...defaultProps} isOnline={false} />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it("shows pending sync count when > 0", () => {
    renderWithTheme(<MobileHeader {...defaultProps} pendingCount={3} />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it("theme toggle button has accessible label", () => {
    renderWithTheme(<MobileHeader {...defaultProps} />);
    expect(screen.getByRole("button", { name: /theme|dark|light/i })).toBeInTheDocument();
  });
});
