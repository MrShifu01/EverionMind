import { generateEmbedding, buildEntryText } from "./generateEmbedding.js";
import { computeCompletenessScore } from "./completeness.js";

// ── MIME / attachment helpers ────────────────────────────────────────────────

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ")
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
        const mod = await import("xlsx");
        const XLSX = (mod as any).default ?? mod;
        const wb = XLSX.read(buffer, { type: "buffer" });
        text = wb.SheetNames.map((n: string) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n\n");
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

export interface GmailPreferences {
  categories: string[];
  custom: string;
  lookbackDays?: 1 | 7 | 30;
}

export function defaultPreferences(): GmailPreferences {
  return {
    categories: ["invoices", "action-required", "subscription-renewal", "appointment", "deadline"],
    custom: "",
    lookbackDays: 7,
  };
}

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

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

export async function fetchRecentEmails(
  token: string,
  sinceMs?: number,
  maxFetch = 50,
): Promise<any[]> {
  const sinceUnix = sinceMs
    ? Math.floor(sinceMs / 1000)
    : Math.floor((Date.now() - 25 * 3600 * 1000) / 1000); // 25h safety window for daily scans

  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", `in:inbox after:${sinceUnix}`);
  listUrl.searchParams.set("maxResults", String(Math.min(maxFetch, 500)));

  const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) return [];

  const messages: { id: string }[] = (await listRes.json()).messages ?? [];
  if (!messages.length) return [];

  const results = await Promise.all(
    messages.slice(0, maxFetch).map(async ({ id }) => {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!r.ok) return null;
      const msg = await r.json();
      const hdrs: Record<string, string> = {};
      for (const h of msg.payload?.headers ?? []) hdrs[h.name.toLowerCase()] = h.value;
      const body = extractBodyFromPayload(msg.payload);
      return {
        id,
        from: hdrs.from ?? "",
        subject: hdrs.subject ?? "(no subject)",
        date: hdrs.date ?? "",
        body: body.slice(0, 3000),
        attachments: listAttachments(msg.payload),
      };
    }),
  );

  return results.filter(Boolean);
}

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

function buildPrompt(emails: any[], prefs: GmailPreferences): string {
  const catLines = prefs.categories
    .filter((c) => CATEGORY_DESCRIPTIONS[c])
    .map((c) => `- **${CATEGORY_LABELS[c] ?? c}** (type="${c}"): ${CATEGORY_DESCRIPTIONS[c]}`)
    .join("\n");
  const customLine = prefs.custom?.trim()
    ? `\nAdditional instructions (follow exactly): ${prefs.custom.trim()}`
    : "";
  const emailBlocks = emails
    .map((e, i) => {
      const bodyPreview = (e.body || "").slice(0, 500).trim();
      const attLine = e.attachments?.length
        ? `Attachments: ${e.attachments.map((a: AttachmentInfo) => a.name).join(", ")}`
        : "";
      return [`[${i}] From: ${e.from}`, `Subject: ${e.subject}`, `Date: ${e.date}`,
        bodyPreview ? `Body: ${bodyPreview}` : "", attLine].filter(Boolean).join("\n");
    })
    .join("\n\n");

  return `You are an email classifier for a personal knowledge system. Identify emails matching ANY of these categories:

${catLines}

Return a JSON array of matches. Return [] if nothing matches. ONLY valid JSON, no prose.

urgency: "high"=due within 3 days or overdue, "medium"=due within 2 weeks, "low"=otherwise.
Set due_date (ISO date or null) and amount (e.g. "$150.00" or null) from what you find.

Format: [{"index":0,"type":"invoices","title":"Invoice from Acme – $150 due 30 Apr","due_date":"2026-04-30","amount":"$150.00","urgency":"high","summary":"One sentence."}]
${customLine}

Emails:
${emailBlocks}`;
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

async function refineWithAttachments(
  emailSubject: string,
  emailBody: string,
  attachmentText: string,
  emailType: string,
  currentTitle: string,
  currentSummary: string,
): Promise<{ title: string; content: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { title: currentTitle, content: currentSummary };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: `Refine this email entry using the attachment content.

Email subject: ${emailSubject}
Category: ${emailType}
Body excerpt: ${emailBody.slice(0, 800)}
Attachment text: ${attachmentText.slice(0, 3000)}

Return ONLY valid JSON: {"title":"...","content":"..."}
title: concise and specific (max 80 chars), include key details like amounts or dates
content: 2-3 sentences summarising what matters (amounts, deadlines, parties, action needed)`,
      }],
    }),
  });
  if (!res.ok) return { title: currentTitle, content: currentSummary };
  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      if (parsed.title && parsed.content) return { title: parsed.title, content: parsed.content };
    }
  } catch {}
  return { title: currentTitle, content: currentSummary };
}

async function getUserBrainId(userId: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/brains?owner_id=eq.${userId}&select=id&limit=1`, {
    headers: SB_HEADERS,
  });
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0]?.id ?? null;
}

async function fetchImportedMessageIds(userId: string): Promise<Set<string>> {
  const r = await fetch(
    `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(userId)}&metadata->>source=eq.gmail&deleted_at=is.null&select=metadata`,
    { headers: SB_HEADERS },
  );
  if (!r.ok) return new Set();
  const rows: any[] = await r.json();
  return new Set(rows.map((e) => e.metadata?.gmail_message_id).filter(Boolean));
}

export interface ScanDebug {
  sinceDate: string;
  emailsFetched: number;
  classified: number;
  skippedDuplicates: number;
  skippedSubjects: string[];
  insertErrors: number;
  tokenRefreshFailed: boolean;
  hasAnthropicKey: boolean;
  hasGeminiKey: boolean;
  repairedBrainId: number;
  attachmentsExtracted: number;
  subjects: string[];
}

export async function scanGmailForUser(
  integration: any,
  manual = false,
  activeBrainId?: string,
): Promise<{ created: number; debug: ScanDebug }> {
  const debug: ScanDebug = {
    sinceDate: "",
    emailsFetched: 0,
    classified: 0,
    skippedDuplicates: 0,
    skippedSubjects: [],
    insertErrors: 0,
    tokenRefreshFailed: false,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasGeminiKey: !!(process.env.GEMINI_API_KEY ?? "").trim(),
    repairedBrainId: 0,
    attachmentsExtracted: 0,
    subjects: [],
  };

  const token = await refreshGmailToken(integration);
  if (!token) {
    debug.tokenRefreshFailed = true;
    return { created: 0, debug };
  }

  const prefs: GmailPreferences = integration.preferences ?? defaultPreferences();

  // Manual scans use the configured look-back window; cron uses last_scanned_at.
  let sinceMs: number | undefined;
  if (manual) {
    const days = prefs.lookbackDays ?? 7;
    sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  } else if (integration.last_scanned_at) {
    sinceMs = new Date(integration.last_scanned_at).getTime();
  }
  debug.sinceDate = sinceMs ? new Date(sinceMs).toISOString() : "last 25h (default)";

  // Manual scans look back further so fetch more messages.
  const emails = await fetchRecentEmails(token, sinceMs, manual ? 500 : 50);
  debug.emailsFetched = emails.length;
  debug.subjects = emails.slice(0, 10).map((e) => e.subject);

  await fetch(`${SB_URL}/rest/v1/gmail_integrations?id=eq.${integration.id}`, {
    method: "PATCH",
    headers: SB_HEADERS,
    body: JSON.stringify({ last_scanned_at: new Date().toISOString() }),
  });

  if (!emails.length) return { created: 0, debug };

  const classified = await classifyWithLLM(buildPrompt(emails, prefs));
  debug.classified = classified.length;
  if (!classified.length) return { created: 0, debug };

  // Fetch already-imported message IDs to prevent duplicates.
  const importedIds = await fetchImportedMessageIds(integration.user_id);

  const brainId = activeBrainId ?? await getUserBrainId(integration.user_id);

  // Repair: assign brain_id to any existing gmail entries that are missing it.
  if (brainId) {
    const orphanRes = await fetch(
      `${SB_URL}/rest/v1/entries?user_id=eq.${encodeURIComponent(integration.user_id)}&metadata->>source=eq.gmail&brain_id=is.null&deleted_at=is.null&select=id`,
      { headers: SB_HEADERS },
    );
    if (orphanRes.ok) {
      const orphans: { id: string }[] = await orphanRes.json();
      for (const orphan of orphans) {
        await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(orphan.id)}`, {
          method: "PATCH",
          headers: { ...SB_HEADERS, Prefer: "return=minimal" },
          body: JSON.stringify({ brain_id: brainId }),
        });
        debug.repairedBrainId++;
      }
    }
  }
  let created = 0;
  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();

  for (const match of classified) {
    const email = emails[match.index];
    if (!email) continue;
    if (importedIds.has(email.id)) { debug.skippedDuplicates++; debug.skippedSubjects.push(email.subject); continue; }

    let title = match.title ?? email.subject;
    let summary = match.summary ?? "";
    const emailAttachments: AttachmentInfo[] = email.attachments ?? [];
    const attachmentText = emailAttachments.length
      ? await fetchAndExtractAttachments(token, email.id, emailAttachments, geminiKey)
      : "";
    debug.attachmentsExtracted += emailAttachments.length;
    if (attachmentText) {
      const refined = await refineWithAttachments(email.subject, email.body, attachmentText, match.type, title, summary);
      title = refined.title;
      summary = refined.content;
    }
    // content = clean LLM summary only; raw attachment text goes to metadata for search/embed
    const content = summary;
    const type = GMAIL_TYPE_MAP[match.type as string] ?? "gmail-flag";
    const tags = [match.type ?? "gmail"];
    const metadata: Record<string, any> = {
      source: "gmail",
      gmail_message_id: email.id,
      gmail_from: email.from,
      gmail_subject: email.subject,
      gmail_date: email.date,
      email_type: match.type,
      due_date: match.due_date ?? null,
      amount: match.amount ?? null,
      urgency: match.urgency ?? "medium",
      completeness_score: computeCompletenessScore(title, content, type, tags, {}),
    };
    if (attachmentText) metadata.attachment_text = attachmentText.slice(0, 6000);

    const entry: Record<string, any> = { user_id: integration.user_id, title, content, type, tags, metadata };
    if (brainId) entry.brain_id = brainId;

    const insertRes = await fetch(`${SB_URL}/rest/v1/entries`, {
      method: "POST",
      headers: { ...SB_HEADERS, Prefer: "return=representation" },
      body: JSON.stringify(entry),
    });
    if (!insertRes.ok) { debug.insertErrors++; continue; }

    const rows: any[] = await insertRes.json();
    const inserted = rows[0];
    created++;
    importedIds.add(email.id); // prevent re-importing within same scan batch

    if (inserted?.id && geminiKey) {
      try {
        const embedContent = attachmentText ? [content, attachmentText].filter(Boolean).join("\n\n") : content;
        const embedding = await generateEmbedding(buildEntryText({ title, content: embedContent, tags }), geminiKey);
        await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(inserted.id)}`, {
          method: "PATCH",
          headers: { ...SB_HEADERS, Prefer: "return=minimal" },
          body: JSON.stringify({
            embedding: `[${embedding.join(",")}]`,
            embedded_at: new Date().toISOString(),
            embedding_provider: "google",
          }),
        });
      } catch (err) {
        console.error(`[gmail-scan:embed] entry ${inserted.id}:`, err);
      }
    }
  }

  return { created, debug };
}

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
