import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "../../src/ThemeContext";
import MobileHeader from "../../src/components/MobileHeader";

function renderWithTheme(ui) {
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

  it("all touch targets are at least 44px", () => {
    const { container } = renderWithTheme(<MobileHeader {...defaultProps} />);
    const buttons = container.querySelectorAll("button");
    buttons.forEach((btn) => {
      const minH = parseInt(btn.style.minHeight, 10) || parseInt(btn.style.height, 10);
      const minW = parseInt(btn.style.minWidth, 10) || parseInt(btn.style.width, 10);
      expect(Math.max(minH, minW)).toBeGreaterThanOrEqual(44);
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
    const themeBtn = screen.getByRole("button", { name: /theme|dark|light/i });
    expect(themeBtn).toBeInTheDocument();
  });
});
