interface ModelLists {
  ANTHROPIC: string[];
  OPENAI: string[];
  OPENROUTER: string[];
}

export const MODELS: ModelLists = {
  ANTHROPIC: ["claude-sonnet-4-6", "claude-opus-4-6"],
  OPENAI: ["gpt-4o-mini", "gpt-4o", "gpt-4.1"],
  OPENROUTER: [
    "google/gemma-4-31b-it:free",
    "meta-llama/llama-4-maverick:free",
    "microsoft/phi-4-reasoning:free",
    "anthropic/claude-3.5-haiku",
    "anthropic/claude-sonnet-4-5",
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
  ],
};
