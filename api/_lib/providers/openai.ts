import type {
  ChatRound,
  ChatStep,
  CompletionOptions,
  CompletionResult,
  ProviderAdapter,
  ProviderConfig,
  ToolSpec,
} from "./types.js";

const API_URL = "https://api.openai.com/v1/chat/completions";

function headers(key: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
}

function toTools(tools: ToolSpec[]): unknown[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export const openai: ProviderAdapter = {
  async completion(opts: CompletionOptions, config: ProviderConfig): Promise<CompletionResult> {
    const msgs: any[] = [];
    if (opts.system) msgs.push({ role: "system", content: opts.system.slice(0, 10000) });
    for (const m of opts.messages) msgs.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });

    const r = await fetch(API_URL, {
      method: "POST",
      headers: headers(config.key),
      body: JSON.stringify({ model: config.model, max_tokens: opts.max_tokens || 1000, messages: msgs }),
    });
    const data: any = await r.json();
    if (!r.ok) return { ok: false, status: r.status, error: data };

    const text = data.choices?.[0]?.message?.content?.trim() || "";
    return { ok: true, status: 200, text };
  },

  async chatStep(round: ChatRound, config: ProviderConfig): Promise<ChatStep> {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: headers(config.key),
      body: JSON.stringify({
        model: config.model,
        max_tokens: round.max_tokens || 2000,
        messages: round.messages,
        tools: toTools(round.tools),
        tool_choice: "auto",
      }),
    });
    const data: any = await r.json();
    if (!r.ok) return { ok: false, status: r.status, error: data };

    const msg = data.choices?.[0]?.message;
    if (!msg?.tool_calls?.length) {
      return { ok: true, status: 200, text: msg?.content?.trim() || "" };
    }

    const call = msg.tool_calls[0];
    let args: Record<string, any>;
    try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

    return {
      ok: true,
      status: 200,
      text: msg?.content?.trim() || undefined,
      toolCall: { name: call.function.name, args },
      toolCallId: call.id,
      rawAssistantMessage: msg,
    };
  },

  appendToolResult(messages: any[], step: ChatStep, toolResult: unknown): void {
    messages.push(step.rawAssistantMessage);
    messages.push({ role: "tool", tool_call_id: step.toolCallId, content: JSON.stringify(toolResult) });
  },
};
