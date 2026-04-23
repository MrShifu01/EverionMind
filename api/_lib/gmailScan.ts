export interface GmailPreferences {
  categories: string[];
  custom: string;
}

export function defaultPreferences(): GmailPreferences {
  return {
    categories: ["invoices", "action-required", "subscription-renewal", "appointment", "deadline"],
    custom: "",
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

export async function fetchRecentEmails(token: string, sinceMs?: number): Promise<any[]> {
  const sinceUnix = sinceMs
    ? Math.floor(sinceMs / 1000)
    : Math.floor((Date.now() - 25 * 3600 * 1000) / 1000); // 25h safety window for daily scans

  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", `in:inbox after:${sinceUnix}`);
  listUrl.searchParams.set("maxResults", "50");

  const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) return [];

  const messages: { id: string }[] = (await listRes.json()).messages ?? [];
  if (!messages.length) return [];

  const results = await Promise.all(
    messages.slice(0, 30).map(async ({ id }) => {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}` +
          `?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!r.ok) return null;
      const msg = await r.json();
      const hdrs: Record<string, string> = {};
      for (const h of msg.payload?.headers ?? []) hdrs[h.name.toLowerCase()] = h.value;
      return {
        id,
        from: hdrs.from ?? "",
        subject: hdrs.subject ?? "(no subject)",
        date: hdrs.date ?? "",
        snippet: (msg.snippet ?? "").slice(0, 300),
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
  "invoices":             "emails containing invoices, payment requests, bills, or amounts due",
  "action-required":      "emails requiring you to do something by a deadline (approve, submit, respond, pay, fill a form)",
  "subscription-renewal": "renewal notices, trial expiry warnings, subscription changes or cancellations",
  "appointment":          "confirmed bookings for travel, medical appointments, restaurants, events, or services",
  "deadline":             "any email referencing a specific deadline, cutoff date, or time-sensitive request not covered above",
  "delivery":             "package tracking updates, delivery notifications, ready-for-collection alerts",
  "signing-requests":     "DocuSign, HelloSign, Adobe Sign, or other e-signature requests",
};

function buildPrompt(emails: any[], prefs: GmailPreferences): string {
  const catLines = prefs.categories
    .filter((c) => CATEGORY_DESCRIPTIONS[c])
    .map((c) => `- **${CATEGORY_LABELS[c] ?? c}** (type="${c}"): ${CATEGORY_DESCRIPTIONS[c]}`)
    .join("\n");
  const customLine = prefs.custom?.trim()
    ? `\n- **Custom** (type="custom"): ${prefs.custom.trim()}`
    : "";
  const emailBlocks = emails
    .map((e, i) => `[${i}] From: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nPreview: ${e.snippet}`)
    .join("\n\n");

  return `You are an email classifier for a personal knowledge system. Identify emails matching ANY of these categories:

${catLines}${customLine}

Return a JSON array of matches. Return [] if nothing matches. ONLY valid JSON, no prose.

urgency: "high"=due within 3 days or overdue, "medium"=due within 2 weeks, "low"=otherwise.
Set due_date (ISO date or null) and amount (e.g. "$150.00" or null) from what you find.

Format: [{"index":0,"type":"invoices","title":"Invoice from Acme – $150 due 30 Apr","due_date":"2026-04-30","amount":"$150.00","urgency":"high","summary":"One sentence."}]

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
      max_tokens: 2048,
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

async function getUserBrainId(userId: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/brains?user_id=eq.${userId}&select=id&limit=1`, {
    headers: SB_HEADERS,
  });
  if (!r.ok) return null;
  const rows: any[] = await r.json();
  return rows[0]?.id ?? null;
}

export async function scanGmailForUser(integration: any): Promise<{ created: number }> {
  const token = await refreshGmailToken(integration);
  if (!token) return { created: 0 };

  const sinceMs = integration.last_scanned_at
    ? new Date(integration.last_scanned_at).getTime()
    : undefined;

  const emails = await fetchRecentEmails(token, sinceMs);

  await fetch(`${SB_URL}/rest/v1/gmail_integrations?id=eq.${integration.id}`, {
    method: "PATCH",
    headers: SB_HEADERS,
    body: JSON.stringify({ last_scanned_at: new Date().toISOString() }),
  });

  if (!emails.length) return { created: 0 };

  const prefs: GmailPreferences = integration.preferences ?? defaultPreferences();
  const classified = await classifyWithLLM(buildPrompt(emails, prefs));
  if (!classified.length) return { created: 0 };

  const brainId = await getUserBrainId(integration.user_id);
  let created = 0;

  for (const match of classified) {
    const email = emails[match.index];
    if (!email) continue;
    const entry: Record<string, any> = {
      user_id: integration.user_id,
      title: match.title ?? email.subject,
      content: match.summary ?? "",
      type: "gmail-flag",
      tags: [match.type ?? "gmail"],
      metadata: {
        source: "gmail",
        gmail_message_id: email.id,
        gmail_from: email.from,
        gmail_subject: email.subject,
        gmail_date: email.date,
        email_type: match.type,
        due_date: match.due_date ?? null,
        amount: match.amount ?? null,
        urgency: match.urgency ?? "medium",
      },
    };
    if (brainId) entry.brain_id = brainId;
    await fetch(`${SB_URL}/rest/v1/entries`, {
      method: "POST",
      headers: { ...SB_HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify(entry),
    });
    created++;
  }

  return { created };
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
