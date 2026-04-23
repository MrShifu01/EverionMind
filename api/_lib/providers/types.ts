export type AIProvider = "gemini-managed" | "gemini-byok" | "anthropic" | "openai";

export interface ProviderConfig {
  provider: AIProvider;
  key: string;
  model: string;
}

export interface CompletionOptions {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  max_tokens?: number;
  system?: string;
}

export interface CompletionResult {
  ok: boolean;
  status: number;
  text?: string;
  error?: unknown;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRound {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  system: string;
  tools: ToolSpec[];
  max_tokens?: number;
}

export interface ChatStep {
  ok: boolean;
  status: number;
  error?: unknown;
  text?: string;
  toolCall?: { name: string; args: Record<string, any> };
  rawAssistantMessage?: unknown;
  toolCallId?: string;
}

export interface ProviderAdapter {
  completion(opts: CompletionOptions, config: ProviderConfig): Promise<CompletionResult>;
  chatStep(round: ChatRound, config: ProviderConfig): Promise<ChatStep>;
  appendToolResult(
    messages: any[],
    step: ChatStep,
    toolResult: unknown,
  ): void;
}
