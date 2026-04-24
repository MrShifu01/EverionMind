import { useState, useEffect, useCallback, useRef } from "react";
import { authFetch } from "../lib/authFetch";

export interface AppNotification {
  id: string;
  type: "merge_suggestion" | "gmail_review" | "auto_merged" | string;
  title: string;
  body?: string;
  data: Record<string, any>;
  read: boolean;
  dismissed: boolean;
  created_at: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);

  const fetch_ = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const r = await authFetch("/api/notifications");
      if (r.ok) setNotifications(await r.json());
    } catch {}
    setLoading(false);
    fetchingRef.current = false;
  }, []);

  // Load on mount
  useEffect(() => { fetch_(); }, [fetch_]);

  // Re-fetch when tab regains focus
  useEffect(() => {
    const onFocus = () => fetch_();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") fetch_();
    });
    return () => window.removeEventListener("focus", onFocus);
  }, [fetch_]);

  const dismiss = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await authFetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, dismissed: true }),
    });
  }, []);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    await authFetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
  }, []);

  const dismissAll = useCallback(async () => {
    setNotifications([]);
    await authFetch("/api/notifications", { method: "DELETE" });
  }, []);

  // Accept a merge suggestion: patch target entry then dismiss notification
  const acceptMerge = useCallback(async (notification: AppNotification) => {
    const { source_entry_id, target_entry_id } = notification.data;
    if (!source_entry_id || !target_entry_id) return;
    await authFetch(`/api/entries?id=${encodeURIComponent(source_entry_id)}&action=merge_into`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: target_entry_id }),
    });
    await dismiss(notification.id);
  }, [dismiss]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, loading, fetch: fetch_, dismiss, markRead, dismissAll, acceptMerge };
}
