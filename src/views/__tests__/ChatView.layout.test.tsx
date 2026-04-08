import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ChatView from "../ChatView";
import { createRef } from "react";

const baseProps = {
  chatMsgs: [],
  chatLoading: false,
  chatInput: "",
  setChatInput: vi.fn(),
  searchAllBrains: false,
  setSearchAllBrains: vi.fn(),
  handleChat: vi.fn(),
  vaultUnlockModal: null,
  setVaultUnlockModal: vi.fn(),
  vaultModalInput: "",
  setVaultModalInput: vi.fn(),
  vaultModalMode: "passphrase" as const,
  setVaultModalMode: vi.fn(),
  vaultModalError: "",
  vaultModalBusy: false,
  handleVaultModalUnlock: vi.fn(),
  chatEndRef: createRef<HTMLDivElement>(),
  brains: [],
  phoneRegex: /\+?\d[\d\s()-]{7,}/g,
};

describe("ChatView — desktop layout (empty state)", () => {
  it("message log does not have flex-1 on desktop when empty (would push composer to bottom)", () => {
    const { container } = render(<ChatView {...baseProps} />);
    const log = container.querySelector('[role="log"]');
    expect(log).toBeInTheDocument();
    // When no messages: log must NOT grow to fill space on desktop.
    // flex-1 alone (without lg:flex-none override) would push the composer
    // to calc(100dvh-80px) on desktop — unusable blank space above the input.
    const classList = log!.className;
    // Must have lg:flex-none so desktop collapses the log to content height
    expect(classList).toMatch(/lg:flex-none/);
  });

  it("message log has flex-1 on desktop when messages exist", () => {
    const msgs = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ];
    const { container } = render(<ChatView {...baseProps} chatMsgs={msgs} />);
    const log = container.querySelector('[role="log"]');
    expect(log!.className).toMatch(/flex-1/);
    expect(log!.className).not.toMatch(/lg:flex-none/);
  });
});
