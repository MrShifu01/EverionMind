import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BottomNav from "../BottomNav";

describe("BottomNav — FAB capture action", () => {
  it("FAB button has accessible label 'New entry'", () => {
    render(<BottomNav activeView="capture" onNavigate={vi.fn()} onCapture={vi.fn()} />);
    expect(screen.getByRole("button", { name: /new entry/i })).toBeInTheDocument();
  });

  it("calls onCapture when the FAB button is clicked", () => {
    const onCapture = vi.fn();
    render(<BottomNav activeView="capture" onNavigate={vi.fn()} onCapture={onCapture} />);
    fireEvent.click(screen.getByRole("button", { name: /new entry/i }));
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it("does not call onNavigate when the FAB is clicked", () => {
    const onNavigate = vi.fn();
    render(<BottomNav activeView="grid" onNavigate={onNavigate} onCapture={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /new entry/i }));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("calls onNavigate with the view id when a non-FAB nav item is clicked", () => {
    const onNavigate = vi.fn();
    render(<BottomNav activeView="capture" onNavigate={onNavigate} onCapture={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^grid$/i }));
    expect(onNavigate).toHaveBeenCalledWith("grid");
  });

  it("active view item has aria-current='page'", () => {
    render(<BottomNav activeView="grid" onNavigate={vi.fn()} onCapture={vi.fn()} />);
    const gridBtn = screen.getByRole("button", { name: /^grid$/i });
    expect(gridBtn).toHaveAttribute("aria-current", "page");
  });
});

describe("BottomNav — More button", () => {
  it("has a More button", () => {
    render(<BottomNav activeView="capture" onNavigate={vi.fn()} onCapture={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^more$/i })).toBeInTheDocument();
  });

  it("calls onNavigate with 'more' when More button is clicked", () => {
    const onNavigate = vi.fn();
    render(<BottomNav activeView="capture" onNavigate={onNavigate} onCapture={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^more$/i }));
    expect(onNavigate).toHaveBeenCalledWith("more");
  });

  it("shows More button as active when activeView is 'vault'", () => {
    render(<BottomNav activeView="vault" onNavigate={vi.fn()} onCapture={vi.fn()} />);
    const moreBtn = screen.getByRole("button", { name: /^more$/i });
    expect(moreBtn).toHaveAttribute("aria-current", "page");
  });

  it("shows More button as active when activeView is 'settings'", () => {
    render(<BottomNav activeView="settings" onNavigate={vi.fn()} onCapture={vi.fn()} />);
    const moreBtn = screen.getByRole("button", { name: /^more$/i });
    expect(moreBtn).toHaveAttribute("aria-current", "page");
  });

  it("shows More button as active when activeView is 'refine'", () => {
    render(<BottomNav activeView="refine" onNavigate={vi.fn()} onCapture={vi.fn()} />);
    const moreBtn = screen.getByRole("button", { name: /^more$/i });
    expect(moreBtn).toHaveAttribute("aria-current", "page");
  });
});
