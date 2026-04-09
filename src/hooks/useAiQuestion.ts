import { useState, useEffect, useCallback } from "react";
import { callAI } from "../lib/ai";
import { PROMPTS } from "../config/prompts";
import type { Entry } from "../types";

interface AiQuestion {
  q: string;
  cat: string;
  p: string;
  ai?: boolean;
}

interface UseAiQuestionOptions {
  entries: Entry[];
  answeredQs: Set<string>;
  brainType: string;
  targetBrainId?: string;
  activeBrainId?: string;
  useSkipped: boolean;
}

export function useAiQuestion({
  entries,
  answeredQs,
  brainType,
  targetBrainId,
  activeBrainId,
  useSkipped,
}: UseAiQuestionOptions) {
  const [aiQuestion, setAiQuestion] = useState<AiQuestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const generateAiQuestion = useCallback(() => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiQuestion(null);
    const ctx = entries
      .slice(0, 40)
      .map((e: Entry) => `- [${e.type}] ${e.title}: ${(e.content || "").slice(0, 120)}`)
      .join("\n");
    const alreadyAsked = Array.from(answeredQs).slice(-20).join(", ");
    const brainContext =
      brainType === "family"
        ? "family shared knowledge base (household, family members, emergencies, finances)"
        : brainType === "business"
          ? "business knowledge base (suppliers, staff, SOPs, costs, licences, equipment)"
          : "personal knowledge base";
    callAI({
      max_tokens: 200,
      system: PROMPTS.FILL_BRAIN.replace("{{BRAIN_CONTEXT}}", brainContext),
      brainId: targetBrainId,
      messages: [
        {
          role: "user",
          content: `Existing entries:\n${ctx || "(none yet)"}\n\nRecently asked questions (do not repeat):\n${alreadyAsked || "(none)"}\n\nWhat important gap should they fill next?`,
        },
      ],
    })
      .then((r) => r.json())
      .then((data) => {
        const raw = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
        let parsed: any = {};
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          console.error("[useAiQuestion]", err);
        }
        setAiQuestion(
          parsed.q
            ? { q: parsed.q, cat: parsed.cat || "AI", p: parsed.p || "medium", ai: true }
            : {
                q: "What's one important thing you haven't captured yet?",
                cat: "AI",
                p: "medium",
                ai: true,
              },
        );
      })
      .catch(() =>
        setAiQuestion({
          q: "What's one important thing you haven't captured yet?",
          cat: "AI",
          p: "medium",
          ai: true,
        }),
      )
      .finally(() => setAiLoading(false));
  }, [aiLoading, entries, answeredQs, brainType, targetBrainId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate first AI question on mount / brain change
  useEffect(() => {
    if (!useSkipped && !aiQuestion && !aiLoading) {
      generateAiQuestion();
    }
  }, [activeBrainId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when active brain changes
  useEffect(() => {
    setAiQuestion(null);
  }, [activeBrainId]);

  return { aiQuestion, aiLoading, generateAiQuestion };
}
