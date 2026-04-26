import { useState, useCallback, useEffect } from "react";
import { authFetch } from "../lib/authFetch";
import { getLearningsContext } from "../lib/learningEngine";

export interface DebugInfo {
  provider: string;
  model: string;
  latency_ms: number;
  rounds: number;
  error?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: string;
  tool_calls?: Array<{ tool: string; args?: unknown; result: unknown }>;
  debug?: DebugInfo;
}

interface PendingAction {
  tool: string;
  args: Record<string, any>;
  label: string;
}

const HISTORY_LIMIT = 30;
const storageKey = (brainId: string) => `chat_history_${brainId}`;

function loadHistory(brainId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(brainId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveHistory(brainId: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(storageKey(brainId), JSON.stringify(messages.slice(-100)));
  } catch {
    /* storage full — non-fatal */
  }
}

export function useChat(brainId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string>("");

  useEffect(() => {
    if (!brainId) return;
    setMessages(loadHistory(brainId));
    setPendingAction(null);
  }, [brainId]);

  const send = useCallback(
    async (message: string, confirmed = false) => {
      if (!brainId || !message.trim()) return;

      const userMsg: ChatMessage = {
        role: "user",
        content: message.trim(),
        ts: new Date().toISOString(),
      };
      const nextMessages = confirmed ? messages : [...messages, userMsg];

      if (!confirmed) setMessages(nextMessages);
      setLoading(true);
      setPendingAction(null);

      const historyForApi = nextMessages
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const body: Record<string, any> = {
          message: message.trim(),
          brain_id: brainId,
          history: historyForApi,
          confirmed,
        };
        if (confirmed && pendingAction) body.pending_action = pendingAction;

        // Inject user-specific learnings so the chat agent adapts to past corrections.
        // Learnings live only in localStorage, so we have to pass them per-request.
        const learnings = getLearningsContext(brainId);
        if (learnings) body.learnings = learnings;

        const res = await authFetch("/api/llm?action=chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (data.pending_action) {
          const assistantMsg: ChatMessage = {
            role: "assistant",
            content: data.reply,
            ts: new Date().toISOString(),
            debug: data._debug,
          };
          const updated = [...nextMessages, assistantMsg];
          setMessages(updated);
          saveHistory(brainId, updated);
          setPendingAction(data.pending_action);
          setPendingMessage(message.trim());
        } else {
          const assistantMsg: ChatMessage = {
            role: "assistant",
            content: data.reply || "No response.",
            ts: new Date().toISOString(),
            tool_calls: data.tool_calls,
            debug: data._debug,
          };
          const updated = [...nextMessages, assistantMsg];
          setMessages(updated);
          saveHistory(brainId, updated);
        }
      } catch {
        const errMsg: ChatMessage = {
          role: "assistant",
          content: "Something went wrong. Please try again.",
          ts: new Date().toISOString(),
        };
        const updated = [...nextMessages, errMsg];
        setMessages(updated);
        saveHistory(brainId, updated);
      }

      setLoading(false);
    },
    [brainId, messages, pendingAction],
  );

  const confirm = useCallback(() => {
    if (!pendingAction || !pendingMessage) return;
    send(pendingMessage, true);
    setPendingMessage("");
  }, [pendingAction, pendingMessage, send]);

  const cancel = useCallback(() => {
    setPendingAction(null);
    setPendingMessage("");
  }, []);

  const clearHistory = useCallback(() => {
    if (!brainId) return;
    setMessages([]);
    localStorage.removeItem(storageKey(brainId));
  }, [brainId]);

  return { messages, loading, pendingAction, send, confirm, cancel, clearHistory };
}
