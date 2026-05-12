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

// Chat history is intentionally session-only. Persistence used to live in
// localStorage under `chat_history_<brainId>`, but it was clutter — voice
// is the primary surface now, the lingering rows always-in-the-way, and
// clear-chat had a refresh-restores-them bug. saveHistory + loadHistory
// are no-ops now; on mount the chat starts blank, on unmount it evaporates.
function saveHistory(_brainId: string, _messages: ChatMessage[]) {
  /* no-op — session-only chat */
}

export function useChat(brainId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string>("");

  useEffect(() => {
    if (!brainId) return;
    // Session-only chat — reset state on brain switch / fresh mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- brain switch is an external event; resetting message list + pending action belongs in an effect.
    setMessages([]);
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

      const historySource = confirmed ? nextMessages : messages;
      const historyForApi = historySource
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
    // Sweep any chat_history_* rows left over from the previous persistent
    // build so existing installs don't carry stale history forward.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("chat_history_")) localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return { messages, loading, pendingAction, send, confirm, cancel, clearHistory };
}
