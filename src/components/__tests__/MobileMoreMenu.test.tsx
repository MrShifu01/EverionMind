import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MobileMoreMenu from "../MobileMoreMenu";

describe("MobileMoreMenu", () => {
  it("does not render when isOpen is false", () => {
    const { container } = render(<MobileMoreMenu isOpen={false} onNavigate={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders when isOpen is true", () => {
    render(<MobileMoreMenu isOpen={true} onNavigate={vi.fn()} />);
    expect(screen.getByText("Refine")).toBeInTheDocument();
    expect(screen.getByText("Vault")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("calls onNavigate with 'refine' when Refine button is clicked", () => {
    const onNavigate = vi.fn();
    render(<MobileMoreMenu isOpen={true} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Refine"));
    expect(onNavigate).toHaveBeenCalledWith("refine");
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

  it("calls onNavigate when backdrop is clicked", () => {
    const onNavigate = vi.fn();
    const { container } = render(<MobileMoreMenu isOpen={true} onNavigate={onNavigate} />);
    const backdrop = container.querySelector("div:first-child");
    if (backdrop) fireEvent.click(backdrop);
    expect(onNavigate).toHaveBeenCalledWith("close");
  });
});
