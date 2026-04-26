import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { VirtualGrid, VirtualTimeline } from "../EntryList";
import type { Entry } from "../../types";

// Minimal virtual scroller mock — renders all items without windowing
vi.mock("@tanstack/react-virtual", () => ({
  useWindowVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 200,
        key: i,
        measureElement: () => {},
      })),
    getTotalSize: () => count * 200,
    options: { scrollMargin: 0 },
    measureElement: vi.fn(),
  }),
}));

const makeEntry = (id: string): Entry =>
  ({
    id,
    title: `Entry ${id}`,
    content: "Some content",
    type: "note",
    tags: [],
    pinned: false,
    importance: 0,
    created_at: new Date().toISOString(),
    metadata: {},
  }) as Entry;

const entries = [makeEntry("1"), makeEntry("2"), makeEntry("3")];

describe("EntryCard (via VirtualGrid) — keyboard accessibility", () => {
  it("renders cards as <article> elements with aria-label and tabIndex=0", () => {
    render(<VirtualGrid filtered={entries} setSelected={vi.fn()} />);
    const cards = screen.getAllByRole("article");
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((card) => {
      expect(card).toHaveAttribute("tabindex", "0");
      expect(card).toHaveAttribute("aria-label");
    });
  });

  it("calls setSelected when Enter is pressed on a card", () => {
    const setSelected = vi.fn();
    render(<VirtualGrid filtered={entries} setSelected={setSelected} />);
    const cards = screen.getAllByRole("article");
    fireEvent.keyDown(cards[0], { key: "Enter" });
    expect(setSelected).toHaveBeenCalledWith(entries[0]);
  });
});

describe("VirtualTimeline rows — keyboard accessibility", () => {
  it("timeline rows are focusable <article> elements with aria-label and tabIndex=0", () => {
    render(<VirtualTimeline sorted={entries} setSelected={vi.fn()} />);
    const cards = screen.getAllByRole("article");
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((card) => {
      expect(card.tagName).toBe("ARTICLE");
      expect(card).toHaveAttribute("tabindex", "0");
      expect(card).toHaveAttribute("aria-label");
    });
  });

  it("calls setSelected when a timeline row is clicked", () => {
    const setSelected = vi.fn();
    render(<VirtualTimeline sorted={entries} setSelected={setSelected} />);
    const cards = screen.getAllByRole("article");
    fireEvent.click(cards[0]);
    expect(setSelected).toHaveBeenCalled();
  });

  it("calls setSelected when Enter is pressed on a timeline row", () => {
    const setSelected = vi.fn();
    render(<VirtualTimeline sorted={entries} setSelected={setSelected} />);
    const cards = screen.getAllByRole("article");
    fireEvent.keyDown(cards[0], { key: "Enter" });
    expect(setSelected).toHaveBeenCalled();
  });
});

describe("EntryCard — visual differentiation for pinned and critical entries", () => {
  it("pinned card has data-pinned='true' attribute", () => {
    const pinnedEntry = { ...makeEntry("pin1"), pinned: true };
    render(<VirtualGrid filtered={[pinnedEntry]} setSelected={vi.fn()} />);
    const card = screen.getByRole("article", { name: /Entry pin1/i });
    expect(card).toHaveAttribute("data-pinned", "true");
  });

  it("non-pinned card does not have data-pinned attribute", () => {
    render(<VirtualGrid filtered={[makeEntry("reg1")]} setSelected={vi.fn()} />);
    const card = screen.getByRole("article", { name: /Entry reg1/i });
    expect(card).not.toHaveAttribute("data-pinned");
  });

  it("critical entry card (importance=2) has data-importance='2' attribute", () => {
    const critEntry = { ...makeEntry("crit1"), importance: 2 };
    render(<VirtualGrid filtered={[critEntry]} setSelected={vi.fn()} />);
    const card = screen.getByRole("article", { name: /Entry crit1/i });
    expect(card).toHaveAttribute("data-importance", "2");
  });

  it("important entry card (importance=1) has data-importance='1' attribute", () => {
    const impEntry = { ...makeEntry("imp1"), importance: 1 };
    render(<VirtualGrid filtered={[impEntry]} setSelected={vi.fn()} />);
    const card = screen.getByRole("article", { name: /Entry imp1/i });
    expect(card).toHaveAttribute("data-importance", "1");
  });

  it("default entry has no data-importance attribute", () => {
    render(<VirtualGrid filtered={[makeEntry("def1")]} setSelected={vi.fn()} />);
    const card = screen.getByRole("article", { name: /Entry def1/i });
    expect(card).not.toHaveAttribute("data-importance");
  });
});

describe("EntryCard — hover-reveal quick actions", () => {
  it("renders pin and delete buttons when callbacks are provided", () => {
    render(
      <VirtualGrid
        filtered={[makeEntry("act1")]}
        setSelected={vi.fn()}
        onPin={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const card = screen.getByRole("article", { name: /Entry act1/i });
    expect(within(card).getByRole("button", { name: /pin/i })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("does not render action buttons when no callbacks are provided", () => {
    render(<VirtualGrid filtered={[makeEntry("act2")]} setSelected={vi.fn()} />);
    const card = screen.getByRole("article", { name: /Entry act2/i });
    expect(within(card).queryByRole("button", { name: /pin/i })).toBeNull();
    expect(within(card).queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("calls onPin with the entry when pin button is clicked", () => {
    const onPin = vi.fn();
    const entry = makeEntry("act3");
    render(<VirtualGrid filtered={[entry]} setSelected={vi.fn()} onPin={onPin} />);
    const card = screen.getByRole("article", { name: /Entry act3/i });
    fireEvent.click(within(card).getByRole("button", { name: /pin/i }));
    expect(onPin).toHaveBeenCalledWith(entry);
  });

  it("calls onDelete with the entry when delete button is clicked", () => {
    const onDelete = vi.fn();
    const entry = makeEntry("act4");
    render(<VirtualGrid filtered={[entry]} setSelected={vi.fn()} onDelete={onDelete} />);
    const card = screen.getByRole("article", { name: /Entry act4/i });
    fireEvent.click(within(card).getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(entry);
  });

  it("pin button label changes to 'Unpin' for already-pinned entries", () => {
    const pinnedEntry = { ...makeEntry("act5"), pinned: true };
    render(<VirtualGrid filtered={[pinnedEntry]} setSelected={vi.fn()} onPin={vi.fn()} />);
    const card = screen.getByRole("article", { name: /Entry act5/i });
    expect(within(card).getByRole("button", { name: /unpin/i })).toBeInTheDocument();
  });
});
