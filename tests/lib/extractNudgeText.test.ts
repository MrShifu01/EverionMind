import { describe, it, expect } from "vitest";
import { extractNudgeText } from "../../src/lib/extractNudgeText";

describe("extractNudgeText", () => {
  it("extracts text from a plain text content block", () => {
    const data = {
      content: [{ type: "text", text: "You have 3 overdue reminders." }],
    };
    expect(extractNudgeText(data)).toBe("You have 3 overdue reminders.");
  });

  it("skips thinking blocks and returns the text block", () => {
    const data = {
      content: [
        { type: "thinking", thinking: "Let me analyse the entries..." },
        { type: "text", text: "Your supplier list needs updating." },
      ],
    };
    expect(extractNudgeText(data)).toBe("Your supplier list needs updating.");
  });

  it("strips inline <think>...</think> tags from the text", () => {
    const data = {
      content: [
        {
          type: "text",
          text: "<think>I should check the dates</think>Check your CIPC renewal deadline.",
        },
      ],
    };
    expect(extractNudgeText(data)).toBe("Check your CIPC renewal deadline.");
  });

  it("strips inline <thinking>...</thinking> tags from the text", () => {
    const data = {
      content: [
        {
          type: "text",
          text: "<thinking>Reasoning here</thinking>\n\nYou have a contact without a phone number.",
        },
      ],
    };
    expect(extractNudgeText(data)).toBe("You have a contact without a phone number.");
  });

  it("returns null when there are no text blocks", () => {
    const data = {
      content: [{ type: "thinking", thinking: "Only thinking, no answer." }],
    };
    expect(extractNudgeText(data)).toBeNull();
  });

  it("returns null for empty or missing content", () => {
    expect(extractNudgeText({})).toBeNull();
    expect(extractNudgeText({ content: [] })).toBeNull();
    expect(extractNudgeText(null)).toBeNull();
  });

  it("returns null when stripping thinking tags leaves an empty string", () => {
    const data = {
      content: [{ type: "text", text: "<think>everything is thinking</think>" }],
    };
    expect(extractNudgeText(data)).toBeNull();
  });
});
