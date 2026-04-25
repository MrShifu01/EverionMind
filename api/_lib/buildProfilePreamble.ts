// ─────────────────────────────────────────────────────────────────────────────
// buildProfilePreamble
//
// Reads the user's personalisation profile (public.user_profiles) and renders
// it into a compact "ABOUT THE USER" block that the chat handler prepends to
// the system message on every call. Capped at ~400 tokens so prompt caching
// makes it effectively free after the first hit in a session.
//
// Returns "" when:
//   - the profile row doesn't exist
//   - the user has flipped enabled = false
//   - all fields are empty
// ─────────────────────────────────────────────────────────────────────────────

import { sbHeaders } from "./sbHeaders.js";

const SB_URL = (process.env.SUPABASE_URL || "").trim();

const MAX_PREAMBLE_CHARS = 1600;
const MAX_HABITS = 12;
const MAX_FAMILY = 10;
const MAX_CONTEXT_CHARS = 1200;

interface FamilyMember {
  relation?: string;
  name?: string;
  notes?: string;
}

interface ProfileRow {
  full_name: string | null;
  preferred_name: string | null;
  pronouns: string | null;
  family: FamilyMember[] | null;
  habits: string[] | null;
  context: string | null;
  enabled: boolean;
}

function clean(s: unknown, max = 200): string {
  if (typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

export async function buildProfilePreamble(userId: string): Promise<string> {
  if (!SB_URL || !userId) return "";

  let row: ProfileRow | undefined;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=full_name,preferred_name,pronouns,family,habits,context,enabled&limit=1`,
      { headers: sbHeaders() },
    );
    if (!r.ok) return "";
    const rows = (await r.json()) as ProfileRow[];
    row = rows[0];
  } catch {
    return "";
  }

  if (!row || row.enabled === false) return "";

  const lines: string[] = [];

  const preferred = clean(row.preferred_name);
  const full = clean(row.full_name);
  if (preferred && full && preferred.toLowerCase() !== full.toLowerCase()) {
    lines.push(`Name: ${preferred} (full name: ${full})`);
  } else if (preferred || full) {
    lines.push(`Name: ${preferred || full}`);
  }

  const pronouns = clean(row.pronouns, 60);
  if (pronouns) lines.push(`Pronouns: ${pronouns}`);

  if (Array.isArray(row.family) && row.family.length) {
    const fam = row.family
      .slice(0, MAX_FAMILY)
      .map((f) => {
        const rel = clean(f?.relation, 40);
        const name = clean(f?.name, 80);
        const notes = clean(f?.notes, 120);
        if (!rel && !name) return "";
        const head = rel && name ? `${rel}: ${name}` : rel || name;
        return notes ? `${head} (${notes})` : head;
      })
      .filter(Boolean);
    if (fam.length) lines.push(`Family: ${fam.join("; ")}`);
  }

  if (Array.isArray(row.habits) && row.habits.length) {
    const habits = row.habits
      .slice(0, MAX_HABITS)
      .map((h) => clean(h, 120))
      .filter(Boolean);
    if (habits.length) lines.push(`Habits: ${habits.join("; ")}`);
  }

  const context = typeof row.context === "string" ? row.context.trim().slice(0, MAX_CONTEXT_CHARS) : "";
  if (context) lines.push(`Context: ${context}`);

  if (!lines.length) return "";

  const body = lines.join("\n").slice(0, MAX_PREAMBLE_CHARS);
  return [
    "",
    "",
    "--- ABOUT THE USER ---",
    "Treat the following as durable, first-party context about the person you are talking to.",
    "Refer to them by their preferred name. Do NOT repeat this block back verbatim unless asked.",
    "Sensitive identifiers (ID number, passport, driver's licence, banking, medical) live in the user's encrypted Vault — never request, store, or display them in chat.",
    "",
    body,
    "--- END ABOUT THE USER ---",
  ].join("\n");
}
