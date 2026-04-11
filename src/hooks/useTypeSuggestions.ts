import { useState, useCallback, useRef } from "react";
import { callAI } from "../lib/ai";

export function useTypeSuggestions() {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const lastKey = useRef("");

  const suggest = useCallback(async (text: string, brainTypes: string[]) => {
    const key = text.trim().slice(0, 200);
    if (!key || key === lastKey.current) return;
    lastKey.current = key;

    setLoading(true);
    try {
      const knownTypes = brainTypes.slice(0, 15).join(", ");
      const res = await callAI({
        max_tokens: 60,
        system: `You are a type classifier. Respond with ONLY a single lowercase type string — the single best type for this entry. Use existing brain types when relevant: [${knownTypes}]. You may also use a new type not on that list if more accurate. Never use "secret". Respond with just the word, no quotes, no punctuation.`,
        messages: [{ role: "user", content: `Entry: ${key}` }],
      });
      if (res.ok) {
        const data = await res.json();
        const raw: string = data.content?.[0]?.text || data.choices?.[0]?.message?.content || "";
        const winner = raw
          .trim()
          .toLowerCase()
          .replace(/[^a-z]/g, "");
        if (winner && winner !== "secret" && winner.length > 0) {
          setSuggestions([winner]);
        }
      }
    } catch {
      // silent — type suggestions are best-effort
    }
    setLoading(false);
  }, []);

  const clear = useCallback(() => {
    setSuggestions([]);
    lastKey.current = "";
  }, []);

  return { suggestions, loading, suggest, clear };
}
