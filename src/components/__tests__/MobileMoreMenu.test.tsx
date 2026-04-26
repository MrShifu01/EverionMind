import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MobileMoreMenu from "../MobileMoreMenu";

describe("MobileMoreMenu", () => {
  it("renders a sidebar panel (always mounted)", () => {
    const { container } = render(<MobileMoreMenu isOpen={false} onNavigate={vi.fn()} />);
    expect(container.firstChild).not.toBeNull();
  });

  it("sidebar panel is translated off-screen when closed", () => {
    render(<MobileMoreMenu isOpen={false} onNavigate={vi.fn()} />);
    const panel = screen.getByRole("complementary");
    expect(panel.className).toContain("translate-x-full");
  });

  it("sidebar panel is visible when open", () => {
    render(<MobileMoreMenu isOpen={true} onNavigate={vi.fn()} />);
    const panel = screen.getByRole("complementary");
    expect(panel.className).toContain("translate-x-0");
  });

  it("renders Vault item", () => {
    render(<MobileMoreMenu isOpen={true} onNavigate={vi.fn()} />);
    expect(screen.getByText("Vault")).toBeInTheDocument();
  });

  it("renders Settings item", () => {
    render(<MobileMoreMenu isOpen={true} onNavigate={vi.fn()} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("calls onNavigate with 'vault' when Vault button is clicked", () => {
    const onNavigate = vi.fn();
    render(<MobileMoreMenu isOpen={true} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Vault"));
    expect(onNavigate).toHaveBeenCalledWith("vault");
  });

  it("calls onNavigate with 'settings' when Settings button is clicked", () => {
    const onNavigate = vi.fn();
    render(<MobileMoreMenu isOpen={true} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Settings"));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("calls onNavigate with 'close' when backdrop is clicked", () => {
    const onNavigate = vi.fn();
    render(<MobileMoreMenu isOpen={true} onNavigate={onNavigate} />);
    const backdrop = document.querySelector("[data-testid='sidebar-backdrop']");
    if (backdrop) fireEvent.click(backdrop);
    expect(onNavigate).toHaveBeenCalledWith("close");
  });
});
