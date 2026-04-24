import { generateEmbedding, buildEntryText } from "./generateEmbedding.js";
import { computeCompletenessScore } from "./completeness.js";
import { storeNotification } from "./mergeDetect.js";

// ── MIME / attachment helpers ────────────────────────────────────────────────

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractBodyFromPayload(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    const text = decodeBase64Url(payload.body.data);
    return payload.mimeType === "text/html" ? stripHtml(text) : text;
  }
  if (!payload.parts) return "";
  let htmlFallback = "";
  for (const part of payload.parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      const t = decodeBase64Url(part.body.data);
      if (t.trim()) return t;
    }
    if (part.mimeType === "text/html" && part.body?.data && !htmlFallback) {
      htmlFallback = stripHtml(decodeBase64Url(part.body.data));
    }
    if (part.mimeType?.startsWith("multipart/")) {
      const nested = extractBodyFromPayload(part);
      if (nested) return nested;
    }
  }
  return htmlFallback;
}

interface AttachmentInfo {
  name: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

function listAttachments(payload: any): AttachmentInfo[] {
  const results: AttachmentInfo[] = [];
  function walk(part: any) {
    if (!part) return;
    if (part.filename && part.body?.attachmentId) {
      results.push({
        name: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        attachmentId: part.body.attachmentId,
        size: part.body.size ?? 0,
      });
    }
    for (const child of part.parts ?? []) walk(child);
  }
  walk(payload);
  return results;
}

const GEMINI_EXTRACT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

async function extractViaGemini(buffer: Buffer, mimeType: string, geminiKey: string): Promise<string> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EXTRACT_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { inlineData: { mimeType, data: buffer.toString("base64") } },
          { text: "Extract all text content from this document. Return only the extracted text, no commentary." },
        ]}],
        generationConfig: { maxOutputTokens: 4096 },
      }),
    },
  );
  if (!r.ok) return "";
  const d = await r.json();
  return (d.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
}

async function fetchAndExtractAttachments(
  token: string,
  messageId: string,
  attachments: AttachmentInfo[],
  geminiKey: string,
): Promise<string> {
  const texts: string[] = [];
  for (const att of attachments.slice(0, 3)) {
    if (att.size > MAX_ATTACHMENT_BYTES) continue;
    try {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${att.attachmentId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!r.ok) continue;
      const { data } = await r.json();
      const buffer = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      const name = att.name.toLowerCase();
      let text = "";

      if (name.endsWith(".docx")) {
        const mod = await import("mammoth");
        const mammoth = (mod as any).default ?? mod;
        const result = await mammoth.extractRawText({ buffer });
        text = result.value ?? "";
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buffer);
        const csvLines: string[] = [];
        for (const sheetName of wb.SheetNames) {
          csvLines.push(XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]));
          csvLines.push("");
        }
        text = csvLines.join("\n").trim();
      } else if (name.endsWith(".pdf") || att.mimeType === "application/pdf") {
        if (geminiKey) text = await extractViaGemini(buffer, "application/pdf", geminiKey);
      } else if (att.mimeType.startsWith("image/")) {
        if (geminiKey) text = await extractViaGemini(buffer, att.mimeType, geminiKey);
      }

      if (text.trim()) texts.push(`[Attachment: ${att.name}]\n${text.slice(0, 2000)}`);
    } catch (err) {
      console.error(`[gmail-scan:attachment] ${messageId}/${att.name}:`, err);
    }
  }
  return texts.join("\n\n");
}

// ── Preferences ─────────────────────────────────────────────────────────────

export interface GmailPreferences {
  categories: string[];
  custom: string;
  lookbackDays?: 1 | 7 | 30;
  minRelevanceScore?: number;
}

export function defaultPreferences(): GmailPreferences {
  return {
    categories: ["invoices", "action-required", "subscription-renewal", "appointment", "deadline"],
    custom: "",
    lookbackDays: 7,
    minRelevanceScore: 60,
  };
}

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};


// ── OAuth token refresh ─────────────────────────────────────────────────────

export async function refreshGmailToken(integration: any): Promise<string | null> {
  if (new Date(integration.token_expires_at) > new Date(Date.now() + 60_000)) {
    return integration.access_token;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: integration.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const t = await res.json();
  await fetch(`${SB_URL}/rest/v1/gmail_integrations?id=eq.${integration.id}`, {
    method: "PATCH",
    headers: SB_HEADERS,
    body: JSON.stringify({
      access_token: t.access_token,
      token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    }),
  });
  return t.access_token;
}

// ── Gmail query builders ────────────────────────────────────────────────────

// Categories used to pre-filter Gmail at the API level. Drastically reduces
// the corpus — we only fetch threads likely to be relevant.
const CATEGORY_SUBJECT_KEYWORDS: Record<string, string[]> = {
  "invoices":             ["invoice", "payment", "bill", "receipt", "statement", "amount due", "pro forma"],
  "action-required":      ["action required", "response required", "approve", "urgent", "submit", "confirm"],
  "subscription-renewal": ["subscription", "renewal", "free trial", "cancel", "expires", "auto-renew"],
  "appointment":          ["appointment", "booking", "reservation", "confirmed", "reminder"],
  "deadline":             ["deadline", "due date", "expires", "overdue", "final notice", "last day"],
  "delivery":             ["delivery", "shipped", "tracking", "dispatched", "arrival", "collection"],
  "signing-requests":     ["sign", "signature", "docusign", "hellosign", "adobe sign"],
};

// Base exclusions that always apply — spam/trash/chats/calendar noise and the
// Promotions/Social categories Gmail already classifies as bulk.
const BASE_EXCLUSIONS =
  "-in:spam -in:trash -from:calendar-notification@google.com -from:googlecalendar-noreply@google.com -label:chats -category:promotions -category:social";

// Returns the categories to use for filtering/classification.
// - categories selected → use them
// - nothing selected + custom rules → custom-only (no predefined categories)
// - nothing selected + no custom rules → fall back to all known categories
function getEffectiveCategories(prefs: GmailPreferences): string[] {
  if (prefs.categories.length > 0) return prefs.categories;
  if (prefs.custom?.trim()) return [];
  return Object.keys(CATEGORY_DESCRIPTIONS);
}

function buildSubjectFilter(categories: string[]): string {
  const keywords = [...new Set(categories.flatMap((c) => CATEGORY_SUBJECT_KEYWORDS[c] ?? []))];
  if (!keywords.length) return "";
  const parts = keywords.map((k) => (k.includes(" ") ? `"${k}"` : k)).join(" OR ");
  return `subject:(${parts})`;
}

function buildGmailQuery(sinceMs: number | undefined, subjectFilter: string): string {
  const sinceUnix = sinceMs ? Math.floor(sinceMs / 1000) : Math.floor((Date.now() - 25 * 3600 * 1000) / 1000);
  const q = `after:${sinceUnix} ${BASE_EXCLUSIONS}`;
  return subjectFilter ? `${q} ${subjectFilter}` : q;
}

// ── Gmail API callers ───────────────────────────────────────────────────────

interface MessageRef {
  id: string;
  threadId: string;
}

async function fetchMessageList(
  token: string,
  query: string,
  maxResults: number,
  pageToken?: string,
): Promise<{ refs: MessageRef[]; nextPageToken: string | null; resultSizeEstimate: number }> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return { refs: [], nextPageToken: null, resultSizeEstimate: 0 };
  const data = await r.json();
  const refs: MessageRef[] = (data.messages ?? []).map((m: any) => ({ id: m.id, threadId: m.threadId }));
  return { refs, nextPageToken: data.nextPageToken ?? null, resultSizeEstimate: data.resultSizeEstimate ?? 0 };
}

async function fetchCurrentHistoryId(token: string): Promise<string | null> {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d.historyId ?? null;
}

// Returns null if Gmail returns 404 (history window expired — caller should fall back to polling).
async function fetchHistoryRefs(
  token: string,
  startHistoryId: string,
): Promise<{ refs: MessageRef[]; latestHistoryId: string | null } | null> {
  const refs: MessageRef[] = [];
  let pageToken: string | undefined;
  let latestHistoryId: string | null = null;
  const seen = new Set<string>();

  for (let page = 0; page < 10; page++) {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
    url.searchParams.set("startHistoryId", startHistoryId);
    url.searchParams.set("historyTypes", "messageAdded");
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404) return null; // history window expired
    if (!r.ok) break;
    const data = await r.json();
    latestHistoryId = data.historyId ?? latestHistoryId;
    for (const h of data.history ?? []) {
      for (const add of h.messagesAdded ?? []) {
        const m = add.message;
        if (!m?.id || !m?.threadId) continue;
        if (seen.has(m.id)) continue;
        // Skip messages in spam/trash/chats (labelIds available here)
        const labels: string[] = m.labelIds ?? [];
        if (labels.includes("SPAM") || labels.includes("TRASH") || labels.includes("CHAT")) continue;
        if (labels.includes("CATEGORY_PROMOTIONS") || labels.includes("CATEGORY_SOCIAL")) continue;
        seen.add(m.id);
        refs.push({ id: m.id, threadId: m.threadId });
      }
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return { refs, latestHistoryId };
}

interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  attachments: AttachmentInfo[];
  headersMap: Record<string, string>;
}

function parseMessage(msg: any): GmailMessage {
  const hdrs: Record<string, string> = {};
  for (const h of msg.payload?.headers ?? []) hdrs[h.name.toLowerCase()] = h.value;
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: hdrs.from ?? "",
    to: hdrs.to ?? "",
    subject: hdrs.subject ?? "(no subject)",
    date: hdrs.date ?? "",
    body: extractBodyFromPayload(msg.payload).slice(0, 3000),
    attachments: listAttachments(msg.payload),
    headersMap: hdrs,
  };
}

async function fetchThread(token: string, threadId: string): Promise<GmailMessage[]> {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) return [];
  const data = await r.json();
  return (data.messages ?? []).map(parseMessage);
}

// ── Thread grouping + bulk detection ────────────────────────────────────────

interface ThreadBlock {
  threadId: string;
  messages: GmailMessage[];
  primary: GmailMessage;       // latest message — used for sender/subject display
  participants: string[];      // unique sender emails across the thread
  attachments: AttachmentInfo[];
  messageIds: string[];
}

function extractEmail(header: string): string {
  const m = header.match(/<([^>]+)>/);
  return (m ? m[1] : header).toLowerCase().trim();
}

function extractName(header: string): string {
  const m = header.match(/^([^<]+?)\s*</);
  if (m) {
    const name = m[1].trim().replace(/^["']|["']$/g, "");
    if (name && !name.includes("@")) return name;
  }
  return "";
}

function normalizeSubject(s: string): string {
  return s.replace(/^(re|fwd?|fw):\s*/gi, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isBulkThread(block: ThreadBlock): boolean {
  // A thread is "bulk" if EVERY message looks automated.
  return block.messages.every((m) => {
    const h = m.headersMap;
    if (h["list-unsubscribe"]) return true;
    if (h["precedence"]?.toLowerCase() === "bulk") return true;
    if (h["auto-submitted"] && h["auto-submitted"].toLowerCase() !== "no") return true;
    const from = (h.from ?? "").toLowerCase();
    if (from.includes("no-reply") || from.includes("noreply") || from.includes("do-not-reply")) {
      return true;
    }
    return false;
  });
}

function groupByThread(messages: GmailMessage[]): Map<string, GmailMessage[]> {
  const map = new Map<string, GmailMessage[]>();
  for (const m of messages) {
    const arr = map.get(m.threadId) ?? [];
    arr.push(m);
    map.set(m.threadId, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
    });
  }
  return map;
}

function buildThreadBlock(messages: GmailMessage[]): ThreadBlock {
  const primary = messages[messages.length - 1];
  const participants = [...new Set(messages.map((m) => extractEmail(m.from)).filter(Boolean))];
  const attachments: AttachmentInfo[] = [];
  for (const m of messages) attachments.push(...m.attachments);
  return {
    threadId: primary.threadId,
    messages,
    primary,
    participants,
    attachments,
    messageIds: messages.map((m) => m.id),
  };
}

// ── LLM classification ──────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  "invoices":             "Invoices & bills",
  "action-required":      "Action required",
  "subscription-renewal": "Subscription renewal",
  "appointment":          "Booking / appointment",
  "deadline":             "Deadline",
  "delivery":             "Delivery / collection",
  "signing-requests":     "Signing request",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "invoices":             "emails containing invoices, payment requests, or bills where a payment is due — including debit order reminders and manual payment notices. Exclude: confirmations that a payment has already been processed automatically.",
  "action-required":      "emails requiring you to do something by a deadline (approve, submit, respond, pay, fill a form)",
  "subscription-renewal": "subscription emails requiring a decision or action — trial ending, manual renewal required, or cancellation needed to avoid charges. Exclude: auto-renewal confirmations where the subscription continues automatically and no action is needed.",
  "appointment":          "confirmed bookings for travel, medical appointments, restaurants, events, or services",
  "deadline":             "any email referencing a specific deadline, cutoff date, or time-sensitive request not covered above",
  "delivery":             "package tracking updates, delivery notifications, ready-for-collection alerts",
  "signing-requests":     "DocuSign, HelloSign, Adobe Sign, or other e-signature requests",
};

const GMAIL_TYPE_MAP: Record<string, string> = {
  "invoices":             "invoice",
  "action-required":      "action-required",
  "subscription-renewal": "subscription",
  "appointment":          "appointment",
  "deadline":             "deadline",
  "delivery":             "delivery",
  "signing-requests":     "signing-request",
};

function buildPrompt(blocks: ThreadBlock[], prefs: GmailPreferences): string {
  const effectiveCategories = getEffectiveCategories(prefs);
  const hasCustom = !!prefs.custom?.trim();

  let catLines = effectiveCategories
    .filter((c) => CATEGORY_DESCRIPTIONS[c])
    .map((c) => `- **${CATEGORY_LABELS[c] ?? c}** (type="${c}"): ${CATEGORY_DESCRIPTIONS[c]}`)
    .join("\n");

  // Custom-only mode: no predefined categories — inject a synthetic one so the LLM
  // has a match target; actual criteria come entirely from the custom instructions.
  if (!catLines && hasCustom) {
    catLines = `- **Custom** (type="custom"): see additional instructions below.`;
  }

  const customLine = hasCustom
    ? `\nAdditional instructions (follow exactly): ${prefs.custom.trim()}`
    : "";

  const threadBlocks = blocks
    .map((b, i) => {
      const lines = [`[${i}] Thread of ${b.messages.length} message${b.messages.length === 1 ? "" : "s"} — participants: ${b.participants.join(", ")}`];
      // Include up to last 4 messages to bound the prompt size.
      const tail = b.messages.slice(-4);
      for (const m of tail) {
        lines.push(`  From: ${m.from}`);
        lines.push(`  Subject: ${m.subject}`);
        lines.push(`  Date: ${m.date}`);
        const body = (m.body || "").slice(0, 400).trim();
        if (body) lines.push(`  Body: ${body}`);
        if (m.attachments.length) {
          lines.push(`  Attachments: ${m.attachments.map((a) => a.name).join(", ")}`);
        }
        lines.push("");
      }
      return lines.join("\n");
    })
    .join("\n---\n");

  return `You are a thread classifier for a personal knowledge system. Each block below is a Gmail THREAD (one or more related messages). Classify each thread as a single unit — consider the full conversation, not individual messages.

Identify threads matching ANY of these categories:

${catLines}

Return a JSON array of matches. Return [] if nothing matches. ONLY valid JSON, no prose.

For each match extract the FINAL state of the thread — the outstanding action, decision, or obligation after the whole conversation. If earlier messages set up an action that was later cancelled or completed, do NOT flag the thread.

urgency: "high"=due within 3 days or overdue, "medium"=due within 2 weeks, "low"=otherwise.
Extract from the email text wherever found:
- due_date: ISO date or null
- amount: monetary total/balance/invoice amount (e.g. "R1,200.00") or null
- account_number: bank account or customer account number or null
- reference_number: invoice/statement/order/reference number or null
title: specific and informative (max 80 chars) — include sender name + amount or deadline. Do NOT copy the subject line verbatim.
summary: one sentence capturing the outstanding obligation including key numbers found.

Format: [{"index":0,"type":"invoices","title":"Acme Corp – R1,200 due 30 Apr","due_date":"2026-04-30","amount":"R1,200.00","account_number":"62012345678","reference_number":"INV-2026-001","urgency":"high","summary":"One sentence."}]
${customLine}

Threads:
${threadBlocks}`;
}

async function classifyWithGemini(
  prompt: string,
  geminiKey: string,
): Promise<{ results: any[]; error?: string; model: string }> {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 65536 },
        }),
      },
    );
    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      const msg = `HTTP ${r.status}: ${errText.slice(0, 300)}`;
      console.error(`[gmail-classify:gemini] ${msg}`);
      return { results: [], error: msg, model };
    }
    const data = await r.json();
    const text: string = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p.text ?? "").join("").trim();
    if (!text) return { results: [], error: "empty response", model };
    const stripped = text.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
    const fullMatch = stripped.match(/\[[\s\S]*\]/);
    if (fullMatch) return { results: JSON.parse(fullMatch[0]), model };
    const objects = [...stripped.matchAll(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g)].map((m) => {
      try { return JSON.parse(m[0]); } catch { return null; }
    }).filter(Boolean);
    if (objects.length) return { results: objects, model };
    return { results: [], error: `no JSON array in: ${text.slice(0, 100)}`, model };
  } catch (e: any) {
    return { results: [], error: String(e?.message ?? e), model };
  }
}

async function classifyWithLLM(prompt: string): Promise<any[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  try {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return [];
  }
}

interface DeepExtractResult {
  title: string;
  content: string;
  amount: string | null;
  account_number: string | null;
  reference_number: string | null;
  invoice_number: string | null;
  name: string | null;
  cellphone: string | null;
  landline: string | null;
  address: string | null;
  id_number: string | null;
  contact_name: string | null;
  due_date: string | null;
  renewal_date: string | null;
  expiry_date: string | null;
}

async function deepExtractEntry(
  emailSubject: string,
  emailBody: string,
  emailFrom: string,
  attachmentText: string,
  emailType: string,
  currentTitle: string,
  currentSummary: string,
  currentAmount: string | null,
): Promise<DeepExtractResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const sourceText = attachmentText
    ? `Body:\n${emailBody.slice(0, 1200)}\n\nAttachment:\n${attachmentText.slice(0, 3000)}`
    : `Body:\n${emailBody.slice(0, 2000)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 768,
      messages: [{
        role: "user",
        content: `Extract structured data from this ${emailType} email. Return ONLY valid JSON, no prose.

From: ${emailFrom}
Subject: ${emailSubject}
${sourceText}

Return this exact shape (use null for any field not found):
{"title":"...","content":"...","amount":null,"account_number":null,"reference_number":null,"invoice_number":null,"name":null,"contact_name":null,"cellphone":null,"landline":null,"address":null,"id_number":null,"due_date":null,"renewal_date":null,"expiry_date":null}

Field rules:
- title: specific (max 80 chars) — sender name + key detail (amount, deadline, or action). Never copy subject verbatim.
- content: 2–3 sentences — outstanding action, amounts, deadlines, parties, and reference numbers.
- amount: total amount due/owed (e.g. "R1,200.00") or null
- account_number: bank or customer account number or null
- reference_number: invoice/statement/order/PO reference or null
- invoice_number: invoice number if distinct from reference_number, or null
- name: full legal name of the person referenced (account holder, recipient) or null
- contact_name: display/trading name of the sender company or person or null
- cellphone: mobile/cell phone number or null
- landline: landline/office phone number or null
- address: physical or postal address or null
- id_number: South African ID number or passport number or null
- due_date: ISO date (YYYY-MM-DD) when payment/action is due or null
- renewal_date: ISO date when subscription/policy renews or null
- expiry_date: ISO date when something expires or null`,
      }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const p = JSON.parse(m[0]);
      return {
        title: p.title || currentTitle,
        content: p.content || currentSummary,
        amount: p.amount || currentAmount,
        account_number: p.account_number || null,
        reference_number: p.reference_number || null,
        invoice_number: p.invoice_number || null,
        name: p.name || null,
        cellphone: p.cellphone || null,
        landline: p.landline || null,
        address: p.address || null,
        id_number: p.id_number || null,
        contact_name: p.contact_name || null,
        due_date: p.due_date || null,
        renewal_date: p.renewal_date || null,
        expiry_date: p.expiry_date || null,
      };
    }
  } catch (e) {
    console.debug("[gmailScan] deepExtractEntry parse failed", e);
  }
  return null;
}

const DEEP_EXTRACT_TYPES = new Set([
  "invoices", "action-required", "signing-requests", "deadline", "appointment", "subscription-renewal",
]);

// ── Relevance score (deterministic, no extra LLM call) ──────────────────────

const TYPE_BASE_SCORE: Record<string, number> = {
  "invoices":             70,
  "action-required":      85,
  "subscription-renewal": 65,
  "appointment":          75,
  "deadline":             90,
  "delivery":             55,
  "signing-requests":     80,
};

function computeRelevanceScore(block: ThreadBlock, match: any): number {
  const base = TYPE_BASE_SCORE[match.type as string] ?? 60;
  const urgencyMod = match.urgency === "high" ? 10 : match.urgency === "low" ? -10 : 0;
  const threadMod = block.messages.length > 1 ? 5 : 0;
  const attachMod = block.attachments.length ? 5 : 0;
  let dueMod = 0;
  if (match.due_date) {
    const due = new Date(match.due_date).getTime();
    if (!isNaN(due)) {
      const days = (due - Date.now()) / 86_400_000;
      if (days < 3) dueMod = 5;
    }
  }
  return Math.max(0, Math.min(100, base + urgencyMod + threadMod + attachMod + dueMod));
}

// ── DB helpers ──────────────────────────────────────────────────────────────

async function getUserBrainId(userId: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/brains?owner_id=eq.${userId}&select=id&limit=1`, {
    headers: SB_HEADERS,
  });
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0]?.id ?? null;
}

async function fetchImportedIdentifiers(userId: string): Promise<{
  threadIds: Set<string>;
  messageIds: Set<string>;
  subjectFromKeys: Set<string>;
}> {
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&metadata->>source=eq.gmail&deleted_at=is.null&select=metadata`,
    { headers: SB_HEADERS },
  );
  if (!r.ok) return { threadIds: new Set(), messageIds: new Set(), subjectFromKeys: new Set() };
  const rows: any[] = await r.json();
  const threadIds = new Set<string>();
  const messageIds = new Set<string>();
  const subjectFromKeys = new Set<string>();
  for (const row of rows) {
    if (row.metadata?.gmail_thread_id) threadIds.add(row.metadata.gmail_thread_id);
    if (row.metadata?.gmail_message_id) messageIds.add(row.metadata.gmail_message_id);
    if (row.metadata?.gmail_from && row.metadata?.gmail_subject) {
      const fe = extractEmail(row.metadata.gmail_from);
      const ns = normalizeSubject(row.metadata.gmail_subject);
      if (fe && ns) subjectFromKeys.add(`${fe}::${ns}`);
    }
  }
  return { threadIds, messageIds, subjectFromKeys };
}

async function upsertGmailContact(
  userId: string,
  brainId: string | null,
  fromHeader: string,
  interactionDate: string,
): Promise<string | null> {
  const email = extractEmail(fromHeader);
  if (!email || !email.includes("@")) return null;
  const name = extractName(fromHeader) || email;

  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${userId}&type=eq.contact&metadata->>contact_email=eq.${encodeURIComponent(email)}&deleted_at=is.null&select=id,metadata&limit=1`,
    { headers: SB_HEADERS },
  );
  if (r.ok) {
    const rows: any[] = await r.json();
    if (rows[0]) {
      const existing = rows[0].metadata ?? {};
      const count = (existing.interaction_count ?? 1) + 1;
      const lastDate = interactionDate && (!existing.last_interaction_at || interactionDate > existing.last_interaction_at)
        ? interactionDate
        : existing.last_interaction_at;
      await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(rows[0].id)}`, {
        method: "PATCH",
        headers: { ...SB_HEADERS, Prefer: "return=minimal" },
        body: JSON.stringify({
          metadata: {
            ...existing,
            interaction_count: count,
            last_interaction_at: lastDate,
          },
        }),
      });
      return rows[0].id;
    }
  }

  const displayName = name && !name.includes("@") ? name : null;
  const entry: Record<string, any> = {
    user_id: userId,
    title: displayName ?? email,
    content: displayName ? `${displayName} · ${email}` : email,
    type: "contact",
    tags: ["contact", "gmail"],
    metadata: {
      source: "gmail",
      contact_email: email,
      contact_name: displayName ?? email,
      first_seen_at: interactionDate,
      last_interaction_at: interactionDate,
      interaction_count: 1,
      enrichment: { parsed: true },
    },
  };
  if (brainId) entry.brain_id = brainId;
  const ins = await fetch(`${SB_URL}/rest/v1/entries`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(entry),
  });
  if (!ins.ok) return null;
  const rows: any[] = await ins.json();
  return rows[0]?.id ?? null;
}

// ── Types exposed to callers ────────────────────────────────────────────────

export interface ScanResultItem {
  entryId: string;
  groupIds: string[];          // all entry IDs in the sender group (thread-level)
  groupCount: number;          // number of threads from this sender in the scan
  threadMessageCount: number;  // message count of the primary thread shown
  title: string;
  summary: string;
  from: string;
  subject: string;
  emailType: string;
  urgency: string;
  amount?: string | null;
  dueDate?: string | null;
  relevanceScore: number;
}

export interface ScanDebug {
  sinceDate: string;
  totalGmailCount: number;
  emailsFetched: number;
  threadsScanned: number;
  classified: number;
  created: number;
  skippedDuplicates: number;
  skippedBulk: number;
  skippedLowScore: number;
  skippedSubjects: string[];
  insertErrors: number;
  tokenRefreshFailed: boolean;
  hasAnthropicKey: boolean;
  hasGeminiKey: boolean;
  repairedBrainId: number;
  attachmentsExtracted: number;
  subjects: string[];
  classifierUsed: string;
  classifierError: string;
  classifierModel: string;
  syncMode: "history" | "polling";
  contactsUpserted: number;
}

function emptyDebug(): ScanDebug {
  return {
    sinceDate: "",
    totalGmailCount: 0,
    emailsFetched: 0,
    threadsScanned: 0,
    classified: 0,
    created: 0,
    skippedDuplicates: 0,
    skippedBulk: 0,
    skippedLowScore: 0,
    skippedSubjects: [],
    insertErrors: 0,
    tokenRefreshFailed: false,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasGeminiKey: !!(process.env.GEMINI_API_KEY ?? "").trim(),
    repairedBrainId: 0,
    attachmentsExtracted: 0,
    subjects: [],
    classifierUsed: "",
    classifierError: "",
    classifierModel: "",
    syncMode: "polling",
    contactsUpserted: 0,
  };
}

// ── Core pipeline: hydrate refs → thread blocks → classify → persist ────────

async function hydrateThreadBlocks(
  token: string,
  refs: MessageRef[],
  importedThreadIds: Set<string>,
  maxThreads: number,
): Promise<ThreadBlock[]> {
  // Dedupe by threadId, drop already-imported threads, cap at maxThreads.
  const seen = new Set<string>();
  const threadIds: string[] = [];
  for (const ref of refs) {
    if (importedThreadIds.has(ref.threadId)) continue;
    if (seen.has(ref.threadId)) continue;
    seen.add(ref.threadId);
    threadIds.push(ref.threadId);
    if (threadIds.length >= maxThreads) break;
  }

  const blocks: ThreadBlock[] = [];
  for (let i = 0; i < threadIds.length; i += 10) {
    const chunk = threadIds.slice(i, i + 10);
    const results = await Promise.all(chunk.map((tid) => fetchThread(token, tid)));
    for (const msgs of results) {
      if (!msgs.length) continue;
      const grouped = groupByThread(msgs);
      for (const arr of grouped.values()) {
        blocks.push(buildThreadBlock(arr));
      }
    }
  }
  return blocks;
}

async function persistMatches(
  token: string,
  integration: any,
  brainId: string | null,
  blocks: ThreadBlock[],
  classified: any[],
  prefs: GmailPreferences,
  geminiKey: string,
  importedThreadIds: Set<string>,
  importedMessageIds: Set<string>,
  importedSubjectFromKeys: Set<string>,
  debug: ScanDebug,
): Promise<{ created: number; scanEntries: ScanResultItem[]; contactsUpserted: number }> {
  const threshold = prefs.minRelevanceScore ?? 60;
  // Dedup contacts within this scan: reuse the same upsert promise per sender email.
  const contactCache = new Map<string, Promise<string | null>>();

  type MatchResult = { scanEntry: ScanResultItem; contactUpserted: boolean } | null;

  const matchResults: MatchResult[] = await Promise.all(
    classified.map(async (match): Promise<MatchResult> => {
      const block = blocks[match.index];
      if (!block) return null;
      if (importedThreadIds.has(block.threadId)) {
        debug.skippedDuplicates++;
        debug.skippedSubjects.push(block.primary.subject);
        return null;
      }
      if (block.messageIds.some((id) => importedMessageIds.has(id))) {
        debug.skippedDuplicates++;
        debug.skippedSubjects.push(block.primary.subject);
        return null;
      }
      // Semantic dedup: same sender + same normalised subject already imported.
      const fromEmail = extractEmail(block.primary.from);
      const subjectKey = `${fromEmail}::${normalizeSubject(block.primary.subject)}`;
      if (importedSubjectFromKeys.has(subjectKey)) {
        debug.skippedDuplicates++;
        debug.skippedSubjects.push(block.primary.subject);
        return null;
      }
      // Reserve all dedup keys NOW (synchronously, before any await) so concurrent
      // handlers in this Promise.all cannot slip through the same checks.
      importedThreadIds.add(block.threadId);
      for (const mid of block.messageIds) importedMessageIds.add(mid);
      importedSubjectFromKeys.add(subjectKey);

      const relevanceScore = computeRelevanceScore(block, match);
      if (relevanceScore < threshold) {
        debug.skippedLowScore++;
        return null;
      }

      let title = match.title ?? block.primary.subject;
      let summary = match.summary ?? "";
      let extractedAmount: string | null = match.amount ?? null;
      let accountNumber: string | null = match.account_number ?? null;
      let referenceNumber: string | null = match.reference_number ?? null;
      let invoiceNumber: string | null = null;
      let extractedName: string | null = null;
      let cellphone: string | null = null;
      let landline: string | null = null;
      let address: string | null = null;
      let idNumber: string | null = null;
      let contactName: string | null = null;
      let deepDueDate: string | null = match.due_date ?? null;
      let renewalDate: string | null = null;
      let expiryDate: string | null = null;

      const attachmentText = block.attachments.length
        ? await fetchAndExtractAttachments(token, block.primary.id, block.attachments, geminiKey)
        : "";
      debug.attachmentsExtracted += block.attachments.length;

      // Always deep-extract for structured types — parses body + attachments for rich fields
      // parsed is only true if the LLM actually ran; null return means it fell back
      let deepExtractSucceeded = !DEEP_EXTRACT_TYPES.has(match.type);
      if (DEEP_EXTRACT_TYPES.has(match.type)) {
        const extracted = await deepExtractEntry(
          block.primary.subject,
          block.primary.body,
          block.primary.from,
          attachmentText,
          match.type,
          title,
          summary,
          extractedAmount,
        );
        if (extracted) {
          deepExtractSucceeded = true;
          title = extracted.title;
          summary = extracted.content;
          extractedAmount = extracted.amount;
          accountNumber = extracted.account_number;
          referenceNumber = extracted.reference_number;
          invoiceNumber = extracted.invoice_number;
          extractedName = extracted.name;
          cellphone = extracted.cellphone;
          landline = extracted.landline;
          address = extracted.address;
          idNumber = extracted.id_number;
          contactName = extracted.contact_name;
          deepDueDate = extracted.due_date ?? deepDueDate;
          renewalDate = extracted.renewal_date;
          expiryDate = extracted.expiry_date;
        }
      }

      const content = summary;
      const type = GMAIL_TYPE_MAP[match.type as string] ?? "gmail-flag";
      const tags = [match.type ?? "gmail"];
      const metadata: Record<string, any> = {
        source: "gmail",
        gmail_message_id: block.primary.id,
        gmail_thread_id: block.threadId,
        gmail_thread_size: block.messages.length,
        gmail_from: block.primary.from,
        gmail_participants: block.participants,
        gmail_subject: block.primary.subject,
        gmail_date: block.primary.date,
        email_type: match.type,
        due_date: deepDueDate,
        amount: extractedAmount,
        urgency: match.urgency ?? "medium",
        relevance_score: relevanceScore,
        completeness_score: computeCompletenessScore(title, content, type, tags, {}),
        enrichment: { parsed: deepExtractSucceeded },
      };
      if (accountNumber) metadata.account_number = accountNumber;
      if (referenceNumber) metadata.reference_number = referenceNumber;
      if (invoiceNumber) metadata.invoice_number = invoiceNumber;
      if (extractedName) metadata.name = extractedName;
      if (contactName) metadata.contact_name = contactName;
      if (cellphone) metadata.cellphone = cellphone;
      if (landline) metadata.landline = landline;
      if (address) metadata.address = address;
      if (idNumber) metadata.id_number = idNumber;
      if (renewalDate) metadata.renewal_date = renewalDate;
      if (expiryDate) metadata.expiry_date = expiryDate;
      if (attachmentText) metadata.attachment_text = attachmentText.slice(0, 6000);

      const entry: Record<string, any> = {
        user_id: integration.user_id,
        title,
        content,
        type,
        tags,
        metadata,
        status: "staged",
      };
      if (brainId) entry.brain_id = brainId;

      const insertRes = await fetch(`${SB_URL}/rest/v1/entries`, {
        method: "POST",
        headers: { ...SB_HEADERS, Prefer: "return=representation" },
        body: JSON.stringify(entry),
      });
      if (!insertRes.ok) {
        debug.insertErrors++;
        return null;
      }
      const rows: any[] = await insertRes.json();
      const inserted = rows[0];
      debug.created++;

      // Fire-and-forget embedding
      if (inserted?.id && geminiKey) {
        const embedContent = attachmentText ? [content, attachmentText].filter(Boolean).join("\n\n") : content;
        generateEmbedding(buildEntryText({ title, content: embedContent, tags }), geminiKey)
          .then((vec) =>
            fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(inserted.id)}`, {
              method: "PATCH",
              headers: { ...SB_HEADERS, Prefer: "return=minimal" },
              body: JSON.stringify({
                embedding: `[${vec.join(",")}]`,
                embedded_at: new Date().toISOString(),
                embedding_provider: "google",
              }),
            }),
          )
          .catch((err) => console.error(`[gmail-scan:embed] entry ${inserted.id}:`, err));
      }

      // Contact dedup: share the same upsert promise for concurrent same-sender entries.
      if (!contactCache.has(fromEmail)) {
        contactCache.set(fromEmail, upsertGmailContact(
          integration.user_id, brainId, block.primary.from,
          block.primary.date || new Date().toISOString(),
        ));
      }
      const contactId = await contactCache.get(fromEmail)!;

      return {
        scanEntry: {
          entryId: inserted?.id ?? "",
          groupIds: [inserted?.id ?? ""],
          groupCount: 1,
          threadMessageCount: block.messages.length,
          title,
          summary: content,
          from: block.primary.from,
          subject: block.primary.subject,
          emailType: match.type ?? "",
          urgency: match.urgency ?? "medium",
          amount: match.amount ?? null,
          dueDate: match.due_date ?? null,
          relevanceScore,
        },
        contactUpserted: !!contactId,
      };
    }),
  );

  const valid = matchResults.filter((r): r is NonNullable<MatchResult> => r !== null);
  return {
    created: valid.length,
    scanEntries: valid.map((r) => r.scanEntry),
    contactsUpserted: valid.filter((r) => r.contactUpserted).length,
  };
}

function groupBySender(items: ScanResultItem[]): ScanResultItem[] {
  const groupMap = new Map<string, ScanResultItem>();
  for (const item of items) {
    const key = extractEmail(item.from) || item.from;
    const existing = groupMap.get(key);
    if (existing) {
      existing.groupIds.push(item.entryId);
      existing.groupCount++;
    } else {
      groupMap.set(key, { ...item, groupIds: [item.entryId] });
    }
  }
  return Array.from(groupMap.values());
}

// ── Public: deep (cursor-paged) scan — used for historical back-fill ────────

export interface DeepScanResult {
  nextCursor: string | null;
  processed: number;
  created: number;
  entries: ScanResultItem[];
  done: boolean;
  totalEstimate: number;
}

export async function deepScanBatch(
  integration: any,
  params: { cursor?: string; sinceMs: number; activeBrainId?: string },
): Promise<DeepScanResult> {
  const token = await refreshGmailToken(integration);
  if (!token) return { nextCursor: null, processed: 0, created: 0, entries: [], done: true, totalEstimate: 0 };

  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  const prefs: GmailPreferences = integration.preferences ?? defaultPreferences();
  const subjectFilter = buildSubjectFilter(getEffectiveCategories(prefs));
  const query = buildGmailQuery(params.sinceMs, subjectFilter);

  // Deep-scan uses polling (time-based) so it can target a historical window.
  const { refs, nextPageToken, resultSizeEstimate } = await fetchMessageList(token, query, 100, params.cursor);
  if (!refs.length) return { nextCursor: null, processed: 0, created: 0, entries: [], done: true, totalEstimate: resultSizeEstimate };

  const { threadIds: importedThreadIds, messageIds: importedMessageIds, subjectFromKeys: importedSubjectFromKeys } = await fetchImportedIdentifiers(integration.user_id);
  const brainId = params.activeBrainId ?? await getUserBrainId(integration.user_id);

  const debug = emptyDebug();
  const blocks = await hydrateThreadBlocks(token, refs, importedThreadIds, 40);
  const usableBlocks = blocks.filter((b) => {
    if (isBulkThread(b)) { debug.skippedBulk++; return false; }
    return true;
  });

  if (!usableBlocks.length) {
    return { nextCursor: nextPageToken, processed: refs.length, created: 0, entries: [], done: !nextPageToken, totalEstimate: resultSizeEstimate };
  }

  const prompt = buildPrompt(usableBlocks, prefs);
  const classified = geminiKey
    ? (await classifyWithGemini(prompt, geminiKey)).results
    : await classifyWithLLM(prompt);

  if (!classified.length) {
    return { nextCursor: nextPageToken, processed: usableBlocks.length, created: 0, entries: [], done: !nextPageToken, totalEstimate: resultSizeEstimate };
  }

  const { scanEntries, created } = await persistMatches(
    token,
    integration,
    brainId,
    usableBlocks,
    classified,
    prefs,
    geminiKey,
    importedThreadIds,
    importedMessageIds,
    importedSubjectFromKeys,
    debug,
  );

  return {
    nextCursor: nextPageToken,
    processed: usableBlocks.length,
    created,
    entries: groupBySender(scanEntries),
    done: !nextPageToken,
    totalEstimate: resultSizeEstimate,
  };
}

// ── Public: incremental scan — history API with polling fallback ────────────

export async function scanGmailForUser(
  integration: any,
  manual = false,
  activeBrainId?: string,
): Promise<{ created: number; debug: ScanDebug; entries: ScanResultItem[] }> {
  const debug = emptyDebug();

  try {
    const token = await refreshGmailToken(integration);
    if (!token) {
      debug.tokenRefreshFailed = true;
      return { created: 0, debug, entries: [] };
    }

    const prefs: GmailPreferences = integration.preferences ?? defaultPreferences();
    const subjectFilter = buildSubjectFilter(getEffectiveCategories(prefs));

    // Resolve the message list:
    //  1. Manual scans OR no history_id → polling (time-based, honours subject filter)
    //  2. Otherwise try history API; if 404, fall back to polling
    let refs: MessageRef[] = [];
    let totalEstimate = 0;

    const historyStart = !manual && typeof integration.history_id === "string" ? integration.history_id : null;

    if (historyStart) {
      const hist = await fetchHistoryRefs(token, historyStart);
      if (hist) {
        refs = hist.refs;
        totalEstimate = refs.length;
        debug.syncMode = "history";
      }
    }

    if (!refs.length && debug.syncMode !== "history") {
      // Polling fallback (or first-ever scan).
      const days = manual ? (prefs.lookbackDays ?? 7) : 7;
      const sinceMs = integration.last_scanned_at && !manual
        ? new Date(integration.last_scanned_at).getTime()
        : Date.now() - days * 86_400_000;
      const query = buildGmailQuery(sinceMs, subjectFilter);
      debug.sinceDate = new Date(sinceMs).toISOString();
      debug.syncMode = "polling";
      const { refs: polled, resultSizeEstimate } = await fetchMessageList(token, query, manual ? 200 : 50);
      refs = polled;
      totalEstimate = resultSizeEstimate;
    } else if (debug.syncMode === "history") {
      debug.sinceDate = `history:${historyStart}`;
    }

    debug.totalGmailCount = totalEstimate;
    debug.emailsFetched = refs.length;

    // Checkpoint last_scanned_at + current history_id for the next incremental run.
    const currentHistoryId = await fetchCurrentHistoryId(token);
    await fetch(`${SB_URL}/rest/v1/gmail_integrations?id=eq.${integration.id}`, {
      method: "PATCH",
      headers: SB_HEADERS,
      body: JSON.stringify({
        last_scanned_at: new Date().toISOString(),
        ...(currentHistoryId ? { history_id: currentHistoryId } : {}),
      }),
    });

    if (!refs.length) {
      storeNotification(integration.user_id, "gmail_scan", "Gmail scan finished", "No new entries found.", { created: 0 }).catch(() => {});
      return { created: 0, debug, entries: [] };
    }

    const { threadIds: importedThreadIds, messageIds: importedMessageIds, subjectFromKeys: importedSubjectFromKeys } = await fetchImportedIdentifiers(integration.user_id);
    const brainId = activeBrainId ?? await getUserBrainId(integration.user_id);

    // Repair: assign brain_id to any existing gmail entries missing it.
    if (brainId) {
      const orphanRes = await fetch(
        `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(integration.user_id)}&metadata->>source=eq.gmail&brain_id=is.null&deleted_at=is.null&select=id`,
        { headers: SB_HEADERS },
      );
      if (orphanRes.ok) {
        const orphans: { id: string }[] = await orphanRes.json();
        if (orphans.length > 0) {
          const ids = orphans.map((o) => encodeURIComponent(o.id)).join(",");
          await fetch(`${SB_URL}/rest/v1/entries?id=in.(${ids})&user_id=eq.${encodeURIComponent(integration.user_id)}`, {
            method: "PATCH",
            headers: { ...SB_HEADERS, Prefer: "return=minimal" },
            body: JSON.stringify({ brain_id: brainId }),
          });
          debug.repairedBrainId = orphans.length;
        }
      }
    }

    const maxThreads = manual ? 80 : 30;
    const blocks = await hydrateThreadBlocks(token, refs, importedThreadIds, maxThreads);
    debug.threadsScanned = blocks.length;
    debug.subjects = blocks.slice(0, 10).map((b) => b.primary.subject);

    const usableBlocks = blocks.filter((b) => {
      if (isBulkThread(b)) { debug.skippedBulk++; return false; }
      return true;
    });

    if (!usableBlocks.length) {
      storeNotification(integration.user_id, "gmail_scan", "Gmail scan finished", "No new entries found.", { created: 0 }).catch(() => {});
      return { created: 0, debug, entries: [] };
    }

    const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
    const prompt = buildPrompt(usableBlocks, prefs);
    let classified: any[];
    if (geminiKey) {
      const { results, error, model } = await classifyWithGemini(prompt, geminiKey);
      classified = results;
      debug.classifierUsed = "gemini";
      debug.classifierModel = model;
      debug.classifierError = error ?? "";
    } else {
      classified = await classifyWithLLM(prompt);
      debug.classifierUsed = process.env.ANTHROPIC_API_KEY ? "anthropic" : "none";
      debug.classifierModel = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
    }
    debug.classified = classified.length;
    if (!classified.length) {
      storeNotification(integration.user_id, "gmail_scan", "Gmail scan finished", "No new entries found.", { created: 0 }).catch(() => {});
      return { created: 0, debug, entries: [] };
    }

    const { created, scanEntries, contactsUpserted } = await persistMatches(
      token,
      integration,
      brainId,
      usableBlocks,
      classified,
      prefs,
      geminiKey,
      importedThreadIds,
      importedMessageIds,
      importedSubjectFromKeys,
      debug,
    );
    debug.contactsUpserted = contactsUpserted;

    // Persist review items as a notification so the user can return to them later
    const grouped = groupBySender(scanEntries);
    if (grouped.length > 0) {
      storeNotification(
        integration.user_id,
        "gmail_review",
        `${created} new item${created !== 1 ? "s" : ""} captured from Gmail`,
        "Tap to review and remove anything irrelevant.",
        { items: grouped, count: created, scanned_at: new Date().toISOString() },
      ).catch(() => {});
    }

    // Always fire a dismissible scan-summary notification
    storeNotification(
      integration.user_id,
      "gmail_scan",
      "Gmail scan finished",
      created === 0
        ? "No new entries found."
        : `${created} entr${created === 1 ? "y" : "ies"} added to your brain.`,
      { created },
    ).catch(() => {});

    return { created, debug, entries: grouped };
  } catch (e: any) {
    console.error("[scanGmailForUser] unexpected error:", e);
    if (!debug.classifierError) debug.classifierError = String(e?.message ?? e);
    return { created: 0, debug, entries: [] };
  }
}

// ── Public: cron entry point ────────────────────────────────────────────────

export async function runGmailScanAllUsers(): Promise<{ users: number; created: number; errors: number }> {
  const r = await fetch(
    `${SB_URL}/rest/v1/gmail_integrations?scan_enabled=eq.true&select=*`,
    { headers: SB_HEADERS },
  );
  if (!r.ok) return { users: 0, created: 0, errors: 0 };

  const integrations: any[] = await r.json();
  const summary = { users: integrations.length, created: 0, errors: 0 };

  await Promise.all(
    integrations.map(async (int) => {
      try {
        const { created } = await scanGmailForUser(int);
        summary.created += created;
      } catch (e) {
        console.error(`[gmail-scan] user ${int.user_id}:`, e);
        summary.errors++;
      }
    }),
  );

  return summary;
}
