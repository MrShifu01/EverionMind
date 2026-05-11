import { useState, useCallback, useEffect } from "react";
import { authFetch } from "../lib/authFetch";
import { getLearningsContext } from "../lib/learningEngine";
import { trackFirstChat } from "../lib/events";

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
  args: Record<string, unknown>;
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chat history is per-brain in localStorage; reload + reset pending on brain switch.
    setMessages(loadHistory(brainId));
    setPendingAction(null);
  }, [brainId]);

  const send = useCallback(
    async (message: string, confirmed = false) => {
      if (!brainId || !message.trim()) return;

      // Funnel — fire on user-initiated sends only. `confirmed=true` is a
      // tool-call retry loop, not a fresh user message.
      if (!confirmed) trackFirstChat();

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
        const body: Record<string, unknown> = {
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

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const error = typeof data.error === "string" ? data.error : "";
          const upgradeUrl = typeof data.upgrade_url === "string" ? data.upgrade_url : "";
          let content = "Something went wrong. Please try again.";
          if (res.status === 429 || error === "monthly_limit_reached") {
            content = upgradeUrl
              ? `Monthly AI limit reached. Upgrade to keep chatting: ${upgradeUrl}`
              : "Monthly AI limit reached. Upgrade in Billing to keep chatting.";
          } else if (error) {
            content = error.replace(/_/g, " ");
          }
          const errMsg: ChatMessage = {
            role: "assistant",
            content,
            ts: new Date().toISOString(),
          };
          const updated = [...nextMessages, errMsg];
          setMessages(updated);
          saveHistory(brainId, updated);
          setLoading(false);
          return;
        }

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
    setMessages([]);
    // Defensively clear the active brain's key AND any stale chat_history_*
    // keys. The early-return on missing brainId left state cleared but
    // localStorage intact, so a refresh repopulated the chat with the
    // same rows the user thought were gone.
    if (brainId) {
      try {
        localStorage.removeItem(storageKey(brainId));
      } catch {
        /* private mode / quota — non-fatal */
      }
    }
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("chat_history_")) localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
  }, [brainId]);

  return { messages, loading, pendingAction, send, confirm, cancel, clearHistory };
}
