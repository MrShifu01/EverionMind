import React from "react";
import { extractPhone, toWaUrl } from "../lib/phone";
import type { Entry } from "../types";

interface EntryQuickActionsProps {
  entry: Entry;
  secretRevealed: boolean;
  onRevealSecret: (revealed: boolean) => void;
  onReorder?: (entry: any) => void;
  onUpdate?: (id: string, changes: any) => Promise<void>;
  handleShare: (entry: Entry) => void;
  shareMsg: string | null;
  onShareMsg: (msg: string | null) => void;
}

export function EntryQuickActions({
  entry,
  secretRevealed,
  onRevealSecret,
  onReorder,
  onUpdate,
  handleShare,
  shareMsg,
  onShareMsg,
}: EntryQuickActionsProps) {
  const phone = extractPhone(entry);
  const isSupplier = entry.tags?.includes("supplier") || entry.metadata?.category === "supplier";
  const isSecret = entry.type === "secret";

  const actions: React.ReactNode[] = [];

  if (isSupplier || entry.type === "contact" || entry.type === "person") {
    if (phone) {
      actions.push(
        <a
          key="call"
          href={`tel:${phone}`}
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
            color: "var(--color-on-surface-variant)",
          }}
        >
          📞 Call
        </a>,
      );
      actions.push(
        <a
          key="wa"
          href={toWaUrl(phone)}
          target="_blank"
          rel="noreferrer"
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
            color: "var(--color-on-surface-variant)",
          }}
        >
          💬 WhatsApp
        </a>,
      );
    }
    if (isSupplier && onReorder) {
      actions.push(
        <button
          key="reorder"
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
            color: "var(--color-on-surface-variant)",
          }}
          onClick={() => onReorder(entry)}
        >
          🔁 Reorder
        </button>,
      );
    }
  }

  if (entry.type === "reminder") {
    if (entry.metadata?.status !== "done") {
      actions.push(
        <button
          key="done"
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all"
          style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          onClick={() =>
            onUpdate?.(entry.id, { metadata: { ...entry.metadata, status: "done" }, importance: 0 })
          }
        >
          ✅ Mark Done
        </button>,
      );
    }
    actions.push(
      <button
        key="snooze1w"
        className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
        style={{
          background: "var(--color-surface-container)",
          border: "1px solid var(--color-outline-variant)",
          color: "var(--color-on-surface-variant)",
        }}
        onClick={() => {
          const d = new Date(entry.metadata?.due_date || Date.now());
          d.setDate(d.getDate() + 7);
          onUpdate?.(entry.id, {
            metadata: { ...entry.metadata, due_date: d.toISOString().split("T")[0] },
          });
        }}
      >
        ⏰ +1 week
      </button>,
    );
    actions.push(
      <button
        key="snooze1m"
        className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
        style={{
          background: "var(--color-surface-container)",
          border: "1px solid var(--color-outline-variant)",
          color: "var(--color-on-surface-variant)",
        }}
        onClick={() => {
          const d = new Date(entry.metadata?.due_date || Date.now());
          d.setMonth(d.getMonth() + 1);
          onUpdate?.(entry.id, {
            metadata: { ...entry.metadata, due_date: d.toISOString().split("T")[0] },
          });
        }}
      >
        ⏰ +1 month
      </button>,
    );
  }

  if (entry.type === "idea") {
    if (entry.metadata?.status !== "in_progress") {
      actions.push(
        <button
          key="start"
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all"
          style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          onClick={() =>
            onUpdate?.(entry.id, { metadata: { ...entry.metadata, status: "in_progress" } })
          }
        >
          🚀 Start this
        </button>,
      );
    }
    if (entry.metadata?.status !== "archived") {
      actions.push(
        <button
          key="archive"
          className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
            color: "var(--color-on-surface-variant)",
          }}
          onClick={() =>
            onUpdate?.(entry.id, { metadata: { ...entry.metadata, status: "archived" } })
          }
        >
          📦 Archive
        </button>,
      );
    }
  }

  if (entry.type === "document" && onReorder) {
    actions.push(
      <button
        key="renewal"
        className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
        style={{
          background: "var(--color-surface-container)",
          border: "1px solid var(--color-outline-variant)",
          color: "var(--color-on-surface-variant)",
        }}
        onClick={() => onReorder({ ...entry, _renewalMode: true })}
      >
        <svg
          className="inline h-3.5 w-3.5 align-middle"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>{" "}
        Set renewal reminder
      </button>,
    );
  }

  if (isSecret && secretRevealed) {
    actions.push(
      <button
        key="copy-secret"
        className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
        style={{
          background: "var(--color-surface-container)",
          border: "1px solid var(--color-outline-variant)",
          color: "var(--color-on-surface-variant)",
        }}
        onClick={() => {
          navigator.clipboard.writeText(entry.content || "").then(() => {
            onShareMsg("Copied to clipboard");
            setTimeout(() => onShareMsg(null), 2500);
          });
        }}
      >
        📋 Copy
      </button>,
    );
    actions.push(
      <button
        key="hide-secret"
        className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
        style={{
          background: "var(--color-surface-container)",
          border: "1px solid var(--color-outline-variant)",
          color: "var(--color-on-surface-variant)",
        }}
        onClick={() => onRevealSecret(false)}
      >
        👁 Hide
      </button>,
    );
  }

  if (!isSecret) {
    actions.push(
      <button
        key="share"
        className="press-scale inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
        style={{
          background: "var(--color-surface-container)",
          border: "1px solid var(--color-outline-variant)",
          color: "var(--color-on-surface-variant)",
        }}
        onClick={() => handleShare(entry)}
      >
        📤 Share
      </button>,
    );
  }

  if (!actions.length) return null;

  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--color-outline-variant)" }}>
      <div className="flex flex-wrap gap-2">{actions}</div>
      {shareMsg && (
        <p className="mt-2 text-center text-xs" style={{ color: "var(--color-primary)" }}>
          {shareMsg}
        </p>
      )}
    </div>
  );
}
