export interface ProviderConfig {
  baseUrl: string; modelsAllowed: string[]; authHeader: string;
}
export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  anthropic: { baseUrl: "https://api.anthropic.com/v1/messages", modelsAllowed: ["claude-haiku-4-5-20251001","claude-sonnet-4-6","claude-opus-4-6"], authHeader: "x-api-key" },
  openai: { baseUrl: "https://api.openai.com/v1/chat/completions", modelsAllowed: ["gpt-4o-mini","gpt-4o","gpt-4.1"], authHeader: "Authorization" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1/chat/completions", modelsAllowed: [], authHeader: "Authorization" },
};
export function resolveProvider(provider: string): ProviderConfig {
  return PROVIDER_CONFIGS[provider] ?? PROVIDER_CONFIGS["anthropic"];
}
