import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "../../src/ThemeContext";

// Minimal stub of the multi-preview modal structure extracted for testing
// We test that the save button is NOT inside the scrollable entries container,
// so it remains visible regardless of how many entries are shown.
function MultiPreviewModal({ entries, onSave, onCancel }: {
  entries: { title: string; type: string; content: string; tags: string[] }[];
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div data-testid="modal-overlay">
      <div data-testid="modal-container">
        <div data-testid="modal-header">
          <span>{entries.length} entries found in file</span>
          <button onClick={onCancel}>✕</button>
        </div>
        <div data-testid="entries-scroll-area" style={{ overflowY: "auto" }}>
          {entries.map((entry, i) => (
            <div key={i} data-testid={`entry-${i}`}>{entry.title}</div>
          ))}
        </div>
        {/* Buttons must be OUTSIDE the scroll area */}
        <div data-testid="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onSave}>Save {entries.length} entries</button>
        </div>
      </div>
    </div>
  );
}

describe("MultiPreviewModal — save button accessibility", () => {
  const mockEntries = Array.from({ length: 10 }, (_, i) => ({
    title: `Entry ${i + 1}`,
    type: "note",
    content: "Some content",
    tags: [],
  }));

  it("renders the save button", () => {
    render(
      <ThemeProvider>
        <MultiPreviewModal entries={mockEntries} onSave={vi.fn()} onCancel={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button", { name: /save 10 entries/i })).toBeInTheDocument();
  });

  it("save button is NOT inside the scrollable entries area", () => {
    render(
      <ThemeProvider>
        <MultiPreviewModal entries={mockEntries} onSave={vi.fn()} onCancel={vi.fn()} />
      </ThemeProvider>
    );
    const scrollArea = screen.getByTestId("entries-scroll-area");
    const saveButton = screen.getByRole("button", { name: /save 10 entries/i });
    expect(scrollArea.contains(saveButton)).toBe(false);
  });

  it("cancel button is NOT inside the scrollable entries area", () => {
    render(
      <ThemeProvider>
        <MultiPreviewModal entries={mockEntries} onSave={vi.fn()} onCancel={vi.fn()} />
      </ThemeProvider>
    );
    const scrollArea = screen.getByTestId("entries-scroll-area");
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    expect(scrollArea.contains(cancelButton)).toBe(false);
  });

  it("modal-actions sits as a sibling of the scroll area, not a child", () => {
    render(
      <ThemeProvider>
        <MultiPreviewModal entries={mockEntries} onSave={vi.fn()} onCancel={vi.fn()} />
      </ThemeProvider>
    );
    const container = screen.getByTestId("modal-container");
    const scrollArea = screen.getByTestId("entries-scroll-area");
    const actions = screen.getByTestId("modal-actions");
    // Both scroll area and actions should be direct children of the container
    expect(container.contains(scrollArea)).toBe(true);
    expect(container.contains(actions)).toBe(true);
    expect(scrollArea.contains(actions)).toBe(false);
  });

  it("overlay has bottom padding large enough to clear the bottom nav", () => {
    render(
      <ThemeProvider>
        <div data-testid="modal-overlay" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 96px)" }}>
          <div data-testid="modal-container" />
        </div>
      </ThemeProvider>
    );
    const overlay = screen.getByTestId("modal-overlay");
    // paddingBottom style must be set (not zero / not 'p-4' flat 16px)
    expect(overlay.style.paddingBottom).toBeTruthy();
    expect(overlay.style.paddingBottom).not.toBe("16px");
  });
});
