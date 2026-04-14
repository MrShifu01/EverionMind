const P = "openbrain_";

export const KEYS = {
  GROQ_KEY: `${P}groq_key`,
  GEMINI_KEY: `${P}gemini_key`,
  EMBED_PROVIDER: `${P}embed_provider`,
  OFFLINE_QUEUE: `${P}queue`,
  ENTRIES_CACHE: `${P}entries`,
  USAGE: `${P}usage`,
  learningDecisions: (brainId: string) => `${P}learning_decisions:${brainId}`,
  learningSummary: (brainId: string) => `${P}learning_summary:${brainId}`,
  taskModel: (task: string) => `${P}task_${task}`,
} as const;
