import { getLearningsContext } from "./learningEngine";

export interface SystemPromptOptions {
  base?: string;
  memoryGuide?: string;
  brainId?: string;
  /** S2-5: Opt-in to learning injection — only chat handler should pass true */
  withLearnings?: boolean;
}

export function buildSystemPrompt({ base = "", memoryGuide, brainId, withLearnings = false }: SystemPromptOptions): string {
  let prompt = base;

  if (memoryGuide) {
    prompt = `[Classification Guide]\n${memoryGuide}\n\n[Task]\n${prompt}`;
  }

  if (withLearnings && brainId) {
    const learnings = getLearningsContext(brainId);
    if (learnings) {
      prompt = `${prompt}\n\n--- USER LEARNING CONTEXT ---\nThis user's past decisions reveal preferences. Adapt your output accordingly:\n${learnings}\n--- END LEARNING CONTEXT ---`;
    }
  }

  return prompt;
}
