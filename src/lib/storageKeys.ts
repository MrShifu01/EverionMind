const P = "openbrain_";

export const KEYS = {
  AI_API_KEY:        `${P}api_key`,
  AI_MODEL:          `${P}model`,
  AI_PROVIDER:       `${P}provider`,
  OPENROUTER_KEY:    `${P}openrouter_key`,
  OPENROUTER_MODEL:  `${P}openrouter_model`,
  GROQ_KEY:          `${P}groq_key`,
  EMBED_PROVIDER:    `${P}embed_provider`,
  EMBED_OPENAI_KEY:  `${P}embed_openai_key`,
  GEMINI_KEY:        `${P}gemini_key`,
  OFFLINE_QUEUE:     `${P}queue`,
  ENTRIES_CACHE:     `${P}entries`,
  learningDecisions: (brainId: string) => `${P}learning_decisions:${brainId}`,
  learningSummary:   (brainId: string) => `${P}learning_summary:${brainId}`,
  taskModel:         (task: string)    => `${P}task_${task}`,
} as const;
