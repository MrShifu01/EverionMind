import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BottomNav from "../BottomNav";

describe("BottomNav — FAB capture action", () => {
  it("FAB button has accessible label 'New entry'", () => {
    render(<BottomNav activeView="feed" onNavigate={vi.fn()} onCapture={vi.fn()} />);
    expect(screen.getByRole("button", { name: /new entry/i })).toBeInTheDocument();
  });

  it("calls onCapture when the FAB button is clicked", () => {
    const onCapture = vi.fn();
    render(<BottomNav activeView="feed" onNavigate={vi.fn()} onCapture={onCapture} />);
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
    render(<BottomNav activeView="feed" onNavigate={onNavigate} onCapture={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^memory$/i }));
    expect(onNavigate).toHaveBeenCalledWith("grid");
  });

  it("active view item has aria-current='page'", () => {
    render(<BottomNav activeView="grid" onNavigate={vi.fn()} onCapture={vi.fn()} />);
    const memBtn = screen.getByRole("button", { name: /^memory$/i });
    expect(memBtn).toHaveAttribute("aria-current", "page");
  });
});
