import { useState, useEffect } from "react";
import { callAI } from "../lib/ai";
import { extractNudgeText } from "../lib/extractNudgeText";
import { PROMPTS } from "../config/prompts";
import type { Entry, Brain } from "../types";

interface UseNudgeParams {
  entriesLoaded: boolean;
  entries: Entry[];
  activeBrain: Brain | null;
}

// Date fields to check for upcoming deadlines/expiry, in priority order
const DATE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "due_date", label: "renewal due" },
  { key: "expiry_date", label: "expires" },
  { key: "valid_to", label: "valid until" },
  { key: "valid_until", label: "valid until" },
  { key: "renewal_date", label: "renewal" },
  { key: "deadline", label: "deadline" },
  { key: "warranty_expiration", label: "warranty expires" },
];

// Detect upcoming date-based issues within the next 180 days
function detectExpirations(entries: Entry[]): string[] {
  const now = new Date();
  const findings: string[] = [];

  for (const e of entries) {
    const meta = (e.metadata || {}) as Record<string, any>;
    for (const { key, label } of DATE_FIELDS) {
      const dateStr = meta[key];
      if (!dateStr) continue;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) continue;
      const daysUntil = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil > 0 && daysUntil <= 180) {
        findings.push(
          `"${e.title}" — ${label} in ${daysUntil} day${daysUntil === 1 ? "" : "s"} (${dateStr})`,
        );
        break; // one finding per entry
      }
    }
  }

  return findings;
}

// Detect entries that look incomplete (gap)
function detectGaps(entries: Entry[]): string[] {
  const gaps: string[] = [];
  const gapTypes = ["person", "document", "contract", "certificate", "company", "supplier"];

  for (const e of entries) {
    if (!gapTypes.includes(e.type ?? "")) continue;
    const hasContent = e.content && e.content.trim().length > 10;
    const hasMeta = Object.keys(e.metadata || {}).length > 0;
    if (!hasContent && !hasMeta) {
      gaps.push(`"${e.title}" (${e.type}) — no details captured yet`);
    }
  }

  return gaps;
}

export function useNudge({ entriesLoaded, entries, activeBrain }: UseNudgeParams) {
  const [nudge, setNudge] = useState<string | null>(
    () => localStorage.getItem("openbrain_nudge") || null,
  );

  useEffect(() => {
    if (!entriesLoaded || localStorage.getItem("openbrain_nudge") !== null) return;

    const recent = entries.slice(0, 50);

    // Deterministic detection — no AI involved
    const expirations = detectExpirations(recent);
    const gaps = detectGaps(recent);

    // Pick up to 2 most actionable findings
    const candidates = [...expirations.slice(0, 2), ...gaps.slice(0, 1)].slice(0, 2);

    if (candidates.length === 0) {
      // Nothing actionable found — skip nudge
      localStorage.setItem("openbrain_nudge", "");
      return;
    }

    // Ask AI to turn the findings into 1-2 friendly, actionable sentences
    // We pass ONLY the curated findings, not raw entry JSON
    const findingsText = candidates.map((c, i) => `${i + 1}. ${c}`).join("\n");

    const systemPrompt = PROMPTS.NUDGE;

    callAI({
      max_tokens: 120,
      system: systemPrompt,
      brainId: activeBrain?.id,
      messages: [
        {
          role: "user",
          content: `Findings:\n${findingsText}`,
        },
      ],
    })
      .then((r) => r.json())
      .then((data) => {
        const text = extractNudgeText(data);
        if (text) {
          setNudge(text);
          localStorage.setItem("openbrain_nudge", text);
        } else {
          // AI gave garbage — fall back to a simple deterministic nudge
          const fallback = candidates[0].replace(/^"/, "").replace(/".*$/, "").trim(); // just the title
          const fallbackMsg =
            expirations.length > 0 ? `Action needed: ${fallback}.` : `Gap: ${fallback}.`;
          setNudge(fallbackMsg);
          localStorage.setItem("openbrain_nudge", fallbackMsg);
        }
      })
      .catch(() => {
        localStorage.setItem("openbrain_nudge", "");
      });
  }, [entriesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return { nudge, setNudge };
}
