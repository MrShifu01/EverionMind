import { describe, it, expect } from "vitest";
import { buildSSELine, parseSSEChunk } from "../../src/lib/streamingChat";
describe("streamingChat (S6-7)", () => {
  it("buildSSELine formats data line", () => {
    expect(buildSSELine({ text: "hello" })).toBe('data: {"text":"hello"}\n\n');
  });
  it("parseSSEChunk extracts text from delta", () => {
    const chunk = { type:"content_block_delta", delta:{ type:"text_delta", text:"hi" } };
    expect(parseSSEChunk(JSON.stringify(chunk))).toBe("hi");
  });
  it("parseSSEChunk returns empty string for non-delta events", () => {
    expect(parseSSEChunk(JSON.stringify({ type:"message_start" }))).toBe("");
  });
});
