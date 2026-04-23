import type {
  ChatRound,
  ChatStep,
  CompletionOptions,
  CompletionResult,
  ProviderAdapter,
  ProviderConfig,
  ToolSpec,
} from "./types.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

function headers(key: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": VERSION,
  };
}

function toTools(tools: ToolSpec[]): unknown[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export const anthropic: ProviderAdapter = {
  async completion(opts: CompletionOptions, config: ProviderConfig): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: config.model,
      max_tokens: opts.max_tokens || 1000,
      messages: opts.messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    };
    if (opts.system) body.system = opts.system.slice(0, 10000);

    const r = await fetch(API_URL, { method: "POST", headers: headers(config.key), body: JSON.stringify(body) });
    const data: any = await r.json();
    if (!r.ok) return { ok: false, status: r.status, error: data };

    const text = (data.content as any[] || [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("")
      .trim();
    return { ok: true, status: 200, text };
  },

  async chatStep(round: ChatRound, config: ProviderConfig): Promise<ChatStep> {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: headers(config.key),
      body: JSON.stringify({
        model: config.model,
        max_tokens: round.max_tokens || 2000,
        system: round.system,
        tools: toTools(round.tools),
        messages: round.messages,
      }),
    });
    const data: any = await r.json();
    if (!r.ok) return { ok: false, status: r.status, error: data };

    const content: any[] = data.content || [];
    const toolUse = content.find((c: any) => c.type === "tool_use");

    if (!toolUse) {
      const text = content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
      return { ok: true, status: 200, text };
    }

    const leadingText = content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
    return {
      ok: true,
      status: 200,
      text: leadingText || undefined,
      toolCall: { name: toolUse.name, args: toolUse.input },
      toolCallId: toolUse.id,
      rawAssistantMessage: content,
    };
  },

  appendToolResult(messages: any[], step: ChatStep, toolResult: unknown): void {
    messages.push({ role: "assistant", content: step.rawAssistantMessage });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: step.toolCallId, content: JSON.stringify(toolResult) }],
    });
  },
};
