import type { ProviderConfig, ChatStep, ToolSpec } from "./types.js";
import { getAdapter } from "./select.js";

export interface ChatRunnerResult {
  ok: boolean;
  status: number;
  reply?: string;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  pendingAction?: { tool: string; args: Record<string, any>; label: string };
  error?: unknown;
  rounds: number;
}

export interface ConfirmPolicy {
  /** Tool names requiring user confirmation before execution. */
  requiresConfirmation: (toolName: string) => boolean;
  /** Build a human-readable label for the pending action, e.g. "Delete 'title'" */
  buildLabel: (toolName: string, args: Record<string, any>) => Promise<string>;
  /** Default confirm prompt text when the model returned no leading text. */
  defaultConfirmText: (toolName: string) => string;
}

export interface ChatRunnerOptions {
  config: ProviderConfig;
  system: string;
  tools: ToolSpec[];
  initialMessages: Array<{ role: "user" | "assistant"; content: string }>;
  maxRounds?: number;
  confirmed: boolean;
  pendingAction?: { tool: string; args: Record<string, any> } | null;
  execTool: (name: string, args: Record<string, any>) => Promise<unknown>;
  confirmPolicy: ConfirmPolicy;
}

function initialToProviderShape(
  provider: ProviderConfig["provider"],
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  system: string,
): any[] {
  if (provider === "anthropic") {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }
  if (provider === "openai") {
    return [
      { role: "system", content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];
  }
  // gemini
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

/**
 * Runs a tool-use chat loop against a provider adapter.
 * Handles: confirmed-action replay, destructive-action confirmation, multi-round tool execution.
 * Capped at maxRounds to avoid runaway loops.
 */
export async function runChat(opts: ChatRunnerOptions): Promise<ChatRunnerResult> {
  const adapter = getAdapter(opts.config.provider);
  const toolCalls: Array<{ tool: string; args: unknown; result: unknown }> = [];

  if (opts.confirmed && opts.pendingAction?.tool && opts.pendingAction?.args) {
    const result = await opts.execTool(opts.pendingAction.tool, opts.pendingAction.args);
    return {
      ok: true,
      status: 200,
      reply: `Done — entry ${opts.pendingAction.tool === "delete_entry" ? "deleted" : "updated"}.`,
      toolCalls: [{ tool: opts.pendingAction.tool, args: opts.pendingAction.args, result }],
      rounds: 0,
    };
  }

  const providerMessages = initialToProviderShape(opts.config.provider, opts.initialMessages, opts.system);
  const max = opts.maxRounds ?? 5;

  for (let round = 0; round < max; round++) {
    const step: ChatStep = await adapter.chatStep(
      { messages: providerMessages, system: opts.system, tools: opts.tools },
      opts.config,
    );

    if (!step.ok) {
      return { ok: false, status: step.status, error: step.error, toolCalls, rounds: round + 1 };
    }

    if (!step.toolCall) {
      return { ok: true, status: 200, reply: step.text ?? "", toolCalls, rounds: round + 1 };
    }

    if (!opts.confirmed && opts.confirmPolicy.requiresConfirmation(step.toolCall.name)) {
      const label = await opts.confirmPolicy.buildLabel(step.toolCall.name, step.toolCall.args);
      const reply = step.text?.trim() || opts.confirmPolicy.defaultConfirmText(step.toolCall.name);
      return {
        ok: true,
        status: 200,
        reply,
        toolCalls,
        pendingAction: { tool: step.toolCall.name, args: step.toolCall.args, label },
        rounds: round + 1,
      };
    }

    let result: unknown;
    try { result = await opts.execTool(step.toolCall.name, step.toolCall.args); }
    catch (e: any) { result = { error: e.message || "Tool execution failed" }; }

    toolCalls.push({ tool: step.toolCall.name, args: step.toolCall.args, result });
    adapter.appendToolResult(providerMessages, step, result);
  }

  return {
    ok: true,
    status: 200,
    reply: "I ran into an issue completing that. Please try again.",
    toolCalls,
    rounds: max,
  };
}
