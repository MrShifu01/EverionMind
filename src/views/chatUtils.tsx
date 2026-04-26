import { useState, useEffect, Fragment } from "react";
import { hasAIAccess } from "../lib/aiSettings";
import type { Entry } from "../types";

export const SUGGESTIONS_TTL = 86_400_000; // 24 h

export function cacheKey(brainId: string | undefined) {
  return `everion_chat_suggestions_${brainId ?? "default"}`;
}

export function readSuggestionsCache(brainId: string | undefined): string[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(brainId));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return Date.now() - ts < SUGGESTIONS_TTL ? data : null;
  } catch {
    return null;
  }
}

export function writeSuggestionsCache(brainId: string | undefined, data: string[]) {
  try {
    localStorage.setItem(cacheKey(brainId), JSON.stringify({ data, ts: Date.now() }));
  } catch (e) {
    console.debug("[ChatView] suggestions cache write failed (quota or JSON)", e);
  }
}

export function derivePrompts(entries: Entry[]): string[] {
  const out: string[] = [];
  const types = new Set(entries.map((e) => e.type));
  const contacts = entries.filter((e) => e.type === "contact" || e.type === "person");
  const hasUpcoming = entries.some(
    (e) => e.metadata?.due_date || e.metadata?.event_date || e.metadata?.deadline,
  );
  if (hasUpcoming) out.push("what's coming up soon?");
  if (types.has("reminder")) out.push("what still needs doing?");
  if (contacts.length > 0) out.push(`what do i know about ${contacts[0].title.split(" ")[0]}?`);
  if (types.has("idea")) out.push("any unactioned ideas?");
  if (types.has("link")) out.push("what links have i saved?");
  if (entries.length > 15) out.push("find any duplicates to merge");
  if (types.has("note")) out.push("summarise my recent notes");
  if (contacts.length > 1) out.push("who should i follow up with?");
  return out.slice(0, 4);
}

export function useHasAIAccess() {
  const [access, setAccess] = useState(() => hasAIAccess());
  useEffect(() => {
    const handler = () => setAccess(hasAIAccess());
    window.addEventListener("aiSettingsLoaded", handler);
    return () => window.removeEventListener("aiSettingsLoaded", handler);
  }, []);
  return access;
}

export const TOOL_LABELS: Record<string, string> = {
  retrieve_memory: "searched memory",
  search_entries: "searched entries",
  get_entry: "fetched entry",
  get_upcoming: "checked upcoming dates",
  create_entry: "created entry",
  update_entry: "updated entry",
  delete_entry: "deleted entry",
};

export const RICH_PATTERN =
  /(\+\d[\d\s-]{8,13}\d|\b0\d{9}\b|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|https?:\/\/[^\s<>]+)/g;

const PHONE_RE = /(\+\d[\d\s-]{8,13}\d|\b0\d{9}\b)/;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

export function firstPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  return digits.startsWith("0") ? "27" + digits.slice(1) : digits;
}

export function firstEmail(text: string): string | null {
  const m = text.match(EMAIL_RE);
  return m ? m[0] : null;
}

export function renderRichText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  RICH_PATTERN.lastIndex = 0;
  while ((m = RICH_PATTERN.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0];
    if (raw.startsWith("http")) {
      parts.push(
        <a
          key={m.index}
          href={raw}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--ember)", textDecoration: "underline" }}
        >
          {raw}
        </a>,
      );
    } else if (raw.includes("@")) {
      parts.push(
        <a
          key={m.index}
          href={`mailto:${raw}`}
          style={{ color: "var(--ember)", textDecoration: "underline" }}
        >
          {raw}
        </a>,
      );
    } else {
      const digits = raw.replace(/\D/g, "");
      const intl = digits.startsWith("0") ? `27${digits.slice(1)}` : digits;
      parts.push(
        <span key={m.index}>
          <a href={`tel:+${intl}`} style={{ color: "var(--ember)", textDecoration: "underline" }}>
            {raw}
          </a>
          <a
            href={`https://wa.me/${intl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="f-sans"
            style={{
              marginLeft: 6,
              fontSize: 11,
              color: "var(--ink-faint)",
              verticalAlign: "middle",
            }}
          >
            wa
          </a>
        </span>,
      );
    }
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function renderInline(text: string, baseKey: number): React.ReactNode {
  const segments = text.split(/(\*\*[^*\n]+\*\*)/g);
  if (segments.length === 1) return <>{renderRichText(text)}</>;
  return (
    <>
      {segments.map((seg, i) =>
        seg.startsWith("**") && seg.endsWith("**") ? (
          <strong key={baseKey + i}>{renderRichText(seg.slice(2, -2))}</strong>
        ) : (
          <Fragment key={baseKey + i}>{renderRichText(seg)}</Fragment>
        ),
      )}
    </>
  );
}

export function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let k = 0;

  const flushList = () => {
    if (!listItems.length) return;
    nodes.push(
      <ul key={k++} style={{ margin: "4px 0 8px 0", paddingLeft: 20, listStyleType: "disc" }}>
        {listItems}
      </ul>,
    );
    listItems = [];
  };

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    if (bullet) {
      listItems.push(<li key={k++} style={{ marginBottom: 2 }}>{renderInline(bullet[1], k)}</li>);
      continue;
    }
    flushList();
    if (line.trim() === "") {
      nodes.push(<div key={k++} style={{ height: 8 }} />);
    } else {
      nodes.push(<div key={k++}>{renderInline(line, k)}</div>);
    }
  }
  flushList();
  return <>{nodes}</>;
}
