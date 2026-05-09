import { randomUUID } from "crypto";
import type { ApiRequest, ApiResponse } from "./_lib/types";
import { SERVER_PROMPTS } from "./_lib/prompts.js";
import { withAuth, ApiError, type AuthedUser } from "./_lib/withAuth.js";
import { mergeEntriesOneShot } from "./_lib/mergeEntries.js";
import {
  retrieveEntriesForUser,
  rebuildConceptGraph,
  findLockedSecretTitles,
} from "./_lib/retrievalCore.js";
import { getUpcomingEntries } from "./_lib/getUpcoming.js";
import { generateEmbedding, buildEntryText } from "./_lib/generateEmbedding.js";
import { checkBrainAccess } from "./_lib/checkBrainAccess.js";
import { enrichInline } from "./_lib/enrich.js";
import { sbHeaders } from "./_lib/sbHeaders.js";
import { selectProvider, getAdapter } from "./_lib/providers/select.js";
import type { ProviderConfig } from "./_lib/providers/types.js";
import { extractFile as geminiExtractFile } from "./_lib/providers/gemini.js";
import { extractFromBuffer } from "./_lib/fileExtract.js";
import { runChat, type ConfirmPolicy } from "./_lib/providers/chatRunner.js";
import { buildProfilePreamble } from "./_lib/buildProfilePreamble.js";
import {
  PERSONA_TOOL_SCHEMAS,
  PERSONA_DESTRUCTIVE_TOOLS,
  PERSONA_TOOL_NAMES,
  buildPersonaConfirmLabel,
  execPersonaTool,
} from "./_lib/personaTools.js";
import { checkAndIncrement } from "./_lib/usage.js";
import { rateLimit } from "./_lib/rateLimit.js";
import { getReqId, createLogger } from "./_lib/logger.js";
import { bodyObject, optionalBodyObject } from "./_lib/requestBody.js";
import { GEMINI_BULK_MODEL, GEMINI_CHAT_MODEL } from "./_lib/geminiModels.js";
import { loadUserAiContext, type UserTier } from "./_lib/loadUserAiContext.js";

export const config = { api: { bodyParser: { sizeLimit: "25mb" } } };

// ── Environment ──────────────────────────────────────────────────────────────

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();
const GEMINI_DEFAULT_MODEL = GEMINI_CHAT_MODEL;
const VALID_GEMINI_MODELS = new Set([
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
]);
const sanitizeGeminiModel = (m: string | null | undefined): string =>
  m && VALID_GEMINI_MODELS.has(m) ? m : GEMINI_DEFAULT_MODEL;

const SB_URL = (process.env.SUPABASE_URL || "").trim();

// ── Provider resolution ──────────────────────────────────────────────────────

interface ChatBody {
  message: string;
  brain_id: string;
  history: any[];
  confirmed: boolean;
  pending_action?: { tool: string; args: Record<string, any>; label: string };
  learnings?: string;
}

async function resolveProvider(userId: string, forChat = false): Promise<ProviderConfig | null> {
  const { tier, settings } = await loadUserAiContext(userId);
  return selectProvider(settings, tier, {
    forChat,
    managed: GEMINI_API_KEY
      ? {
          key: GEMINI_API_KEY,
          starterModel: GEMINI_BULK_MODEL,
          starterChatModel: GEMINI_CHAT_MODEL,
          proModel: GEMINI_BULK_MODEL,
          proChatModel: GEMINI_CHAT_MODEL,
        }
      : undefined,
    sanitizeGeminiModel,
  });
}

// File extraction always uses Gemini (BYOK Gemini preferred, server fallback)
async function resolveGeminiKey(userId: string): Promise<string> {
  const r = await fetch(
    `${SB_URL}/rest/v1/user_ai_settings?user_id=eq.${encodeURIComponent(userId)}&select=gemini_key&limit=1`,
    { headers: sbHeaders() },
  );
  if (r.ok) {
    const rows: any[] = await r.json();
    if (rows[0]?.gemini_key) return rows[0].gemini_key;
  }
  return GEMINI_API_KEY;
}

async function resolveSettingsRaw(userId: string): Promise<{ tier: UserTier; hasKey: boolean }> {
  const { tier, settings } = await loadUserAiContext(userId);
  return {
    tier,
    hasKey: !!(settings.anthropic_key || settings.openai_key || settings.gemini_key),
  };
}

// ── Tool declarations ─────────────────────────────────────────────────────────

interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description?: string; items?: { type: string } }>;
    required: string[];
  };
}

const CHAT_TOOLS: ToolSchema[] = [
  {
    name: "retrieve_memory",
    description:
      "Full semantic retrieval across every brain the user can read (their own + brains they're a member or viewer on). Vector search + keyword expansion. Use this for most queries — it finds the most relevant entries regardless of which brain they live in.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language question or topic to search for" },
        limit: { type: "number", description: "Max entries to return (1–50, default 15)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_upcoming",
    description: "Return entries with upcoming due dates, deadlines, expiry dates, or event dates.",
    parameters: {
      type: "object",
      properties: {
        days: { type: "number", description: "Look-ahead window in days (1–365, default 30)" },
      },
      required: [],
    },
  },
  {
    name: "get_entry",
    description: "Fetch a single entry by its UUID.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Entry UUID" } },
      required: ["id"],
    },
  },
  {
    name: "search_entries",
    description:
      "Low-level vector-only search across every brain the user can read. Use retrieve_memory for most queries.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Natural language search query" } },
      required: ["query"],
    },
  },
  {
    name: "create_entry",
    description: "Save new information to the user's knowledge base.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short descriptive title (max 200 chars)" },
        content: { type: "string", description: "Full content to store" },
        type: {
          type: "string",
          description:
            "Entry type: note, person, recipe, task, event, document, idea, contact. Defaults to note.",
        },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_entry",
    description:
      "Update an existing entry's title, content, tags, or type. Only call after user has confirmed the change.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Entry UUID to update" },
        title: { type: "string", description: "New title (optional)" },
        content: { type: "string", description: "New content (optional)" },
        type: { type: "string", description: "New entry type (optional)" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "New tags array (optional, replaces existing)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_entry",
    description: "Soft-delete an entry. Only call after user has confirmed the deletion.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Entry UUID to delete" } },
      required: ["id"],
    },
  },
  {
    name: "merge_entries",
    description:
      "Combine 2-8 user-owned entries into one LLM-synthesised entry, then soft-delete the sources. The originals are recoverable from trash. Use after the user has explicitly confirmed which entries to merge — do NOT call this on speculation. All entries must be in the same brain; vault entries (type='secret') cannot be merged. Returns the new merged entry.",
    parameters: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          description: "UUIDs of the entries to merge (2-8)",
        },
      },
      required: ["ids"],
    },
  },
];

const DESTRUCTIVE_TOOLS = new Set([
  "update_entry",
  "delete_entry",
  "merge_entries",
  ...Array.from(PERSONA_DESTRUCTIVE_TOOLS),
]);

// Append persona tools to the chat tool list.
CHAT_TOOLS.push(...(PERSONA_TOOL_SCHEMAS as unknown as ToolSchema[]));

// ── Tool execution ────────────────────────────────────────────────────────────

async function execTool(
  name: string,
  args: Record<string, any>,
  userId: string,
  brainId: string,
): Promise<unknown> {
  if (PERSONA_TOOL_NAMES.has(name)) {
    return execPersonaTool(name, args, userId, brainId);
  }
  if (name === "retrieve_memory") {
    // Chat searches every brain the user can read — owned + member-of —
    // plus entries shared into any of those (migration 070/071). The
    // single-brain `retrieveEntries` is still used by API-key endpoints
    // (v1, memory-api, mcp) where the caller picks scope. Locked-secret
    // titles stay scoped to the active brain — vault entries surface in
    // the brain you're focused on, not cross-brain.
    const [result, lockedSecrets] = await Promise.all([
      retrieveEntriesForUser(
        args.query,
        userId,
        GEMINI_API_KEY,
        Math.min(Math.max(1, args.limit || 15), 50),
      ),
      findLockedSecretTitles(args.query, brainId, 5),
    ]);
    return { ...result, lockedSecrets };
  }
  if (name === "search_entries") {
    const embedding = await generateEmbedding(args.query, GEMINI_API_KEY);
    if (!embedding) return { entries: [] };
    const r = await fetch(`${SB_URL}/rest/v1/rpc/match_entries_for_user`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify({
        query_embedding: `[${embedding.join(",")}]`,
        p_user_id: userId,
        match_count: 10,
      }),
    });
    return r.ok ? r.json() : { entries: [] };
  }
  if (name === "get_entry") {
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,content,type,tags,metadata,created_at,updated_at`,
      { headers: sbHeaders() },
    );
    if (!r.ok) return { error: "Failed to fetch entry" };
    const rows: any[] = await r.json();
    if (!rows[0]) return { error: "Entry not found" };
    if (rows[0].type === "secret")
      return { error: "Entry is locked in Vault — open the app to view" };
    return rows[0];
  }
  if (name === "get_upcoming") {
    return getUpcomingEntries(brainId, args.days || 30);
  }
  if (name === "create_entry") {
    const safeTitle = String(args.title || "")
      .trim()
      .slice(0, 200);
    const safeContent = String(args.content || "").slice(0, 200_000);
    const safeType = String(args.type || "note")
      .trim()
      .slice(0, 50)
      .toLowerCase();
    if (safeType === "secret")
      return {
        error: "Cannot create vault entries via chat — use the in-app Vault to encrypt secrets",
      };
    const safeTags = Array.isArray(args.tags)
      ? args.tags.slice(0, 20).map((t: any) => String(t).slice(0, 50))
      : [];
    let embedding: number[] | null = null;
    if (GEMINI_API_KEY)
      embedding = await generateEmbedding(
        buildEntryText({ title: safeTitle, content: safeContent, tags: safeTags }),
        GEMINI_API_KEY,
      );
    const id = (randomUUID as () => string)();
    const r = await fetch(`${SB_URL}/rest/v1/entries`, {
      method: "POST",
      headers: { ...sbHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        id,
        user_id: userId,
        brain_id: brainId,
        title: safeTitle,
        content: safeContent,
        type: safeType,
        tags: safeTags,
        embedding: embedding ? `[${embedding.join(",")}]` : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) return { error: `Failed to create: ${await r.text().catch(() => r.status)}` };
    const rows: any[] = await r.json();
    rebuildConceptGraph(brainId, userId).catch((err: unknown) =>
      console.error("[llm:conceptGraph] rebuild failed — graph view will stay stale", err),
    );
    // AWAIT enrichInline before returning — fire-and-forget on Vercel Node.js
    // is unreliable (function instance can be killed before the IIFE
    // completes, leaving entries with parsed=false forever). Slows the chat
    // tool call by a few seconds but the user sees a fully-enriched entry
    // on first render. Hourly cron is the safety net for any path that
    // somehow misses this.
    try {
      await enrichInline(id, userId);
    } catch (err) {
      console.error("[llm:create_entry:enrich]", id, err);
    }
    return rows[0];
  }
  if (name === "update_entry") {
    const entryRes = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}&brain_id=eq.${encodeURIComponent(brainId)}&deleted_at=is.null&select=id,title,content,tags,type&limit=1`,
      { headers: sbHeaders() },
    );
    if (!entryRes.ok) return { error: "Failed to fetch entry" };
    const rows: any[] = await entryRes.json();
    if (!rows.length) return { error: "Entry not found" };
    if (rows[0].type === "secret")
      return { error: "Entry is locked in Vault — open the app to edit" };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (args.title !== undefined) patch.title = String(args.title).trim().slice(0, 200);
    if (args.content !== undefined) patch.content = String(args.content).slice(0, 200_000);
    if (args.type !== undefined) {
      const newType = String(args.type).trim().slice(0, 50).toLowerCase();
      if (newType === "secret")
        return {
          error:
            "Cannot retype an entry to 'secret' via chat — move it through the in-app Vault flow",
        };
      patch.type = newType;
    }
    if (args.tags !== undefined)
      patch.tags = (args.tags as any[]).slice(0, 20).map((t) => String(t).slice(0, 50));
    if (
      GEMINI_API_KEY &&
      (args.title !== undefined || args.content !== undefined || args.tags !== undefined)
    ) {
      const merged = {
        title: (patch.title ?? rows[0].title) as string,
        content: (patch.content ?? rows[0].content) as string,
        tags: (patch.tags ?? rows[0].tags ?? []) as string[],
      };
      const emb = await generateEmbedding(buildEntryText(merged), GEMINI_API_KEY);
      if (emb) patch.embedding = `[${emb.join(",")}]`;
    }
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}&brain_id=eq.${encodeURIComponent(brainId)}`,
      {
        method: "PATCH",
        headers: { ...sbHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(patch),
      },
    );
    if (!r.ok) return { error: `Update failed: ${await r.text().catch(() => r.status)}` };
    const updated: any[] = await r.json();
    rebuildConceptGraph(brainId, userId).catch((err: unknown) =>
      console.error("[llm:conceptGraph] rebuild failed — graph view will stay stale", err),
    );
    // AWAIT — see create_entry above for rationale.
    try {
      await enrichInline(args.id, userId);
    } catch (err) {
      console.error("[llm:update_entry:enrich]", args.id, err);
    }
    return updated[0];
  }
  if (name === "delete_entry") {
    const checkRes = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}&brain_id=eq.${encodeURIComponent(brainId)}&user_id=eq.${encodeURIComponent(userId)}&select=type&limit=1`,
      { headers: sbHeaders() },
    );
    if (!checkRes.ok) return { error: "Failed to fetch entry" };
    const checkRows: any[] = await checkRes.json();
    if (!checkRows.length) return { error: "Entry not found" };
    if (checkRows[0].type === "secret")
      return { error: "Entry is locked in Vault — open the app to delete" };
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(args.id)}&brain_id=eq.${encodeURIComponent(brainId)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { ...sbHeaders(), Prefer: "return=minimal" },
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      },
    );
    if (!r.ok) return { error: `Delete failed: ${await r.text().catch(() => r.status)}` };
    return { id: args.id, deleted: true };
  }
  if (name === "merge_entries") {
    if (!Array.isArray(args.ids) || args.ids.length < 2 || args.ids.length > 8) {
      return { error: "ids must be an array of 2-8 entry uuids" };
    }
    try {
      const result = await mergeEntriesOneShot(userId, args.ids);
      return result;
    } catch (err: unknown) {
      if (err instanceof ApiError) return { error: err.message };
      return { error: err instanceof Error ? err.message : "Merge failed" };
    }
  }
  return { error: `Unknown tool: ${name}` };
}

async function fetchEntryTitle(entryId: string, brainId: string): Promise<string | null> {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(entryId)}&brain_id=eq.${encodeURIComponent(brainId)}&select=title&limit=1`,
      { headers: sbHeaders() },
    );
    if (!r.ok) return null;
    const rows: any[] = await r.json();
    return rows[0]?.title ?? null;
  } catch {
    return null;
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleCompletion(
  res: ApiResponse,
  opts: { messages: any[]; max_tokens?: number; system?: string; json?: boolean },
  provider: ProviderConfig,
): Promise<void> {
  const adapter = getAdapter(provider.provider);
  const result = await adapter.completion(opts, provider);
  if (!result.ok) {
    console.error(`[llm/${provider.provider}]`, result.status, JSON.stringify(result.error));
    return res.status(result.status).json(result.error);
  }
  return res
    .status(200)
    .json({ content: [{ type: "text", text: result.text ?? "" }], model: provider.model });
}

async function auditToolCalls(
  userId: string,
  brainId: string,
  reqId: string,
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>,
): Promise<void> {
  if (!toolCalls.length) return;
  const rows = toolCalls.map((tc) => ({
    user_id: userId,
    action: `chat:${tc.tool}`,
    request_id: reqId,
    metadata: {
      tool: tc.tool,
      brain_id: brainId,
      args_summary: JSON.stringify(tc.args).slice(0, 500),
    },
  }));
  await fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
}

async function handleChat(
  req: ApiRequest,
  res: ApiResponse,
  user: AuthedUser,
  provider: ProviderConfig,
  reqId: string,
  quotaCtx?: { plan: string; hasKey: boolean },
): Promise<void> {
  const log = createLogger(reqId, { user_id: user.id });
  const t0 = Date.now();
  const {
    message,
    brain_id,
    history = [],
    confirmed = false,
    pending_action,
    learnings,
  } = bodyObject(req.body) as unknown as ChatBody;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message required" });
    return;
  }
  if (!brain_id || typeof brain_id !== "string") {
    res.status(400).json({ error: "brain_id required" });
    return;
  }

  const brainAccess = await checkBrainAccess(user.id, brain_id);
  if (!brainAccess) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const safeHistory = (Array.isArray(history) ? history : [])
    .filter((m: any) => typeof m?.content === "string" && ["user", "assistant"].includes(m?.role))
    .slice(-20);

  const initialMessages = [
    ...safeHistory.map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    })),
    { role: "user" as const, content: message },
  ];

  // Personalisation preamble — injected unconditionally when the user has a
  // profile row with enabled=true. Returns "" otherwise. Cheap to fetch and
  // stable enough across calls that prompt caching pays for it after call 1.
  const profilePreamble = await buildProfilePreamble(user.id, brain_id).catch(() => "");

  // Learnings are client-side (localStorage per brain). Truncate defensively.
  const learningsBlock =
    typeof learnings === "string" && learnings.trim()
      ? `\n\n--- USER LEARNING CONTEXT ---\nThis user's past decisions reveal preferences. Adapt your output accordingly:\n${learnings.slice(0, 4000)}\n--- END LEARNING CONTEXT ---`
      : "";

  const systemPrompt = `${SERVER_PROMPTS.CHAT_AGENT}${profilePreamble}${learningsBlock}`;

  const confirmPolicy: ConfirmPolicy = {
    requiresConfirmation: (name) => DESTRUCTIVE_TOOLS.has(name),
    buildLabel: async (toolName, args) => {
      if (PERSONA_DESTRUCTIVE_TOOLS.has(toolName)) {
        return buildPersonaConfirmLabel(toolName, args, brain_id);
      }
      if (toolName === "merge_entries") {
        const ids = Array.isArray(args.ids) ? args.ids : [];
        const titles = await Promise.all(
          ids.slice(0, 3).map((idVal: unknown) =>
            typeof idVal === "string" ? fetchEntryTitle(idVal, brain_id) : Promise.resolve(null),
          ),
        );
        const named = titles.filter((t): t is string => !!t);
        const overflow = ids.length > named.length ? ` + ${ids.length - named.length} more` : "";
        return named.length
          ? `Merge ${ids.length} entries: ${named.map((t) => `"${t}"`).join(", ")}${overflow}`
          : `Merge ${ids.length} entries`;
      }
      const verb = toolName === "delete_entry" ? "Delete" : "Update";
      const title = await fetchEntryTitle(args.id, brain_id);
      return title ? `${verb} "${title}"` : `${verb} entry (${String(args.id).slice(0, 8)}…)`;
    },
    defaultConfirmText: (toolName) => {
      if (toolName === "persona.retire_fact")
        return "I'm about to move this from your About You into history. Confirm?";
      if (toolName === "persona.update_fact")
        return "I'm about to replace this fact with a new version. Confirm?";
      if (toolName === "merge_entries")
        return "I'm about to combine these entries into one and move the originals to trash. Confirm?";
      return toolName === "delete_entry"
        ? "I'm about to delete this entry. Confirm?"
        : "I'm about to update this entry. Confirm?";
    },
  };

  const isManaged = provider.provider === "gemini-managed";
  const instrumentedExecTool = async (name: string, args: Record<string, any>) => {
    log.info("tool_call", { tool: name, brain_id });
    if (isManaged && quotaCtx) {
      checkAndIncrement(user.id, "chats", quotaCtx.plan, quotaCtx.hasKey).catch(
        (err: unknown) =>
          console.error(
            "[llm:quota] chat increment failed — user may exceed plan silently this cycle",
            err,
          ),
      );
    }
    return execTool(name, args, user.id, brain_id);
  };

  const result = await runChat({
    config: provider,
    system: systemPrompt,
    tools: CHAT_TOOLS,
    initialMessages,
    confirmed,
    pendingAction: pending_action ? { tool: pending_action.tool, args: pending_action.args } : null,
    execTool: instrumentedExecTool,
    confirmPolicy,
  });

  auditToolCalls(user.id, brain_id, reqId, result.toolCalls).catch(() => {});

  const debug = {
    provider: provider.provider,
    model: provider.model,
    latency_ms: Date.now() - t0,
    rounds: result.rounds,
    ...(result.error
      ? { error: `${result.status}: ${JSON.stringify(result.error).slice(0, 500)}` }
      : {}),
  };

  if (!result.ok) {
    res
      .status(200)
      .json({ reply: "Sorry, something went wrong. Please try again.", _debug: debug });
    return;
  }

  res.status(200).json({
    reply: result.reply,
    tool_calls: result.toolCalls,
    ...(result.pendingAction ? { pending_action: result.pendingAction } : {}),
    _debug: debug,
  });
}

// ── Server-side split fallback ────────────────────────────────────────────────

function parseServerEntries(raw: string): Array<Record<string, unknown>> {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const m = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  const candidate = m ? m[1] : cleaned;
  try {
    const parsed = JSON.parse(candidate);
    const arr: any[] = Array.isArray(parsed) ? parsed : parsed?.title ? [parsed] : [];
    return arr
      .filter((e: any) => typeof e?.title === "string" && e.title.trim())
      .map((e: any) => ({
        title: String(e.title).trim().slice(0, 200),
        content: String(e.content || "").slice(0, 200_000),
        type: String(e.type || "note").trim(),
        tags: Array.isArray(e.tags)
          ? e.tags.filter((t: any) => typeof t === "string").slice(0, 20)
          : [],
        ...(e.metadata && typeof e.metadata === "object" ? { metadata: e.metadata } : {}),
      }));
  } catch {
    return [];
  }
}

async function handleSplit(req: ApiRequest, res: ApiResponse, userId: string): Promise<void> {
  const { content } = optionalBodyObject(req.body);
  if (!content || typeof content !== "string") {
    res.status(400).json({ error: "content required" });
    return;
  }
  const provider = await resolveProvider(userId);
  if (!provider) {
    res.status(200).json({ entries: [] });
    return;
  }

  const adapter = getAdapter(provider.provider);
  const result = await adapter.completion(
    {
      messages: [{ role: "user", content: String(content).slice(0, 150_000) }],
      system: SERVER_PROMPTS.CAPTURE,
      max_tokens: 2000,
    },
    provider,
  );
  const entries = result.ok && result.text ? parseServerEntries(result.text) : [];
  res.status(200).json({ entries });
}

// ── File extraction (always Gemini) ──────────────────────────────────────────

// 33 MB base64 ≈ 24 MB raw file. Sits just under the 25 MB bodyParser cap
// so the JSON envelope (mimeType, quotes, etc.) still fits.
const MAX_FILE_B64 = 33 * 1024 * 1024;

async function handleExtractFile(
  req: ApiRequest,
  res: ApiResponse,
  geminiKey: string,
): Promise<void> {
  const { fileData, mimeType, filename } = bodyObject(req.body) as {
    fileData?: string;
    mimeType?: string;
    filename?: string;
  };
  if (!fileData || typeof fileData !== "string") {
    res.status(400).json({ error: "fileData required" });
    return;
  }
  if (!mimeType) {
    res.status(400).json({ error: "mimeType required" });
    return;
  }
  if (fileData.length > MAX_FILE_B64) {
    res.status(413).json({ error: "File too large (max ~24 MB)" });
    return;
  }
  // Validate base64 charset before decoding. Without this, garbage input
  // silently truncates at the first non-base64 char and the parser sees a
  // short buffer that fails to a "successful but empty" extraction — the
  // user thinks the file imported when nothing was actually parsed.
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(fileData) || Buffer.byteLength(fileData) < 4) {
    res.status(400).json({ error: "fileData must be valid base64" });
    return;
  }

  // Try local parsers first (PDF, DOCX, XLSX, CSV, plain text, HTML).
  // Free, fast, no token cap, deterministic. Only images and scanned PDFs
  // need to escalate to Gemini vision.
  try {
    const buffer = Buffer.from(fileData, "base64");
    const local = await extractFromBuffer(buffer, mimeType, filename ?? "");
    if (local && local.text.trim().length > 0) {
      res.status(200).json({ text: local.text, source: local.source });
      return;
    }
  } catch (e: any) {
    // extractFromBuffer now throws on magic-byte / extension mismatch.
    // Surface that as 415 so the user knows their file was rejected, not
    // silently turned into empty text.
    if (e?.message?.includes("refusing to parse")) {
      res.status(415).json({ error: e.message });
      return;
    }
    console.warn("[extract-file:local]", e?.message || e);
    // fall through to Gemini for transient parser errors
  }

  // Gemini fallback for images, scanned PDFs, and anything the local
  // dispatch can't handle.
  try {
    const result = await geminiExtractFile(
      { fileData, mimeType },
      { model: GEMINI_BULK_MODEL, key: geminiKey, prompt: SERVER_PROMPTS.EXTRACT_FILE },
    );
    if (!result.ok) {
      console.error("[extract-file]", result.status, JSON.stringify(result.error));
      res.status(result.status).json(result.error);
      return;
    }
    res.status(200).json({ text: result.text ?? "", source: "gemini" });
  } catch (e: any) {
    console.error("[extract-file]", e);
    res.status(502).json({ error: e.message || "Extraction failed" });
  }
}

// ── List extraction from file ────────────────────────────────────────────────
//
// Two-stage: extract verbatim text from the file (local parser → Gemini
// vision fallback, same as handleExtractFile), then send the text to
// Gemini with the EXTRACT_LIST prompt to get a structured list of
// { title, description? } pairs. Lets users build a list directly from
// a menu PDF, product catalogue, scanned checklist, etc.

// Mime types we'll accept for list extraction. Audio / video / archives /
// executables are explicitly rejected at the boundary so a malformed
// upload can't reach the model.
const LIST_EXTRACT_ALLOWED_MIMES = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "text/html",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/json",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const LIST_EXTRACT_TIMEOUT_MS = 30_000;

async function handleExtractListFromFile(
  req: ApiRequest,
  res: ApiResponse,
  geminiKey: string,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { fileData, mimeType, filename } = bodyObject(req.body) as {
    fileData?: string;
    mimeType?: string;
    filename?: string;
  };
  if (!fileData || typeof fileData !== "string") {
    res.status(400).json({ error: "fileData required" });
    return;
  }
  if (!mimeType || typeof mimeType !== "string") {
    res.status(400).json({ error: "mimeType required" });
    return;
  }
  const normalizedMime = mimeType.split(";")[0]!.trim().toLowerCase();
  if (!LIST_EXTRACT_ALLOWED_MIMES.has(normalizedMime)) {
    res.status(415).json({ error: `Unsupported file type: ${normalizedMime}` });
    return;
  }
  if (fileData.length > MAX_FILE_B64) {
    res.status(413).json({ error: "File too large (max ~24 MB)" });
    return;
  }
  // Validate base64 — rejects anything that isn't actually base64-encoded
  // before we hand it to the buffer decoder.
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(fileData)) {
    res.status(400).json({ error: "fileData must be base64" });
    return;
  }

  // Stage 1: get plain text out of the file. Mirrors handleExtractFile —
  // local parser first (free, fast), Gemini vision fallback for images
  // and scanned PDFs.
  let extractedText = "";
  try {
    const buffer = Buffer.from(fileData, "base64");
    const local = await extractFromBuffer(buffer, normalizedMime, filename ?? "");
    if (local && local.text.trim().length > 0) {
      extractedText = local.text;
    }
  } catch (e: any) {
    console.warn("[extract-list:local]", e?.message || e);
  }
  if (!extractedText) {
    try {
      const result = await geminiExtractFile(
        { fileData, mimeType: normalizedMime },
        { model: GEMINI_BULK_MODEL, key: geminiKey, prompt: SERVER_PROMPTS.EXTRACT_FILE },
      );
      if (!result.ok) {
        console.error("[extract-list:vision]", result.status, JSON.stringify(result.error));
        res.status(result.status).json(result.error);
        return;
      }
      extractedText = (result.text ?? "").trim();
    } catch (e: any) {
      console.error("[extract-list:vision]", e);
      res.status(502).json({ error: e.message || "Extraction failed" });
      return;
    }
  }

  if (!extractedText) {
    res.status(200).json({ items: [], note: "No readable text in file" });
    return;
  }

  // Stage 2: Gemini turns text into structured list. JSON mode forces
  // the response into our { items: [...] } shape. Timeout-bounded so a
  // hung connection can't pin a serverless function.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_BULK_MODEL)}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SERVER_PROMPTS.EXTRACT_LIST }] },
    contents: [{ role: "user", parts: [{ text: extractedText.slice(0, 80_000) }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8000,
      responseMimeType: "application/json",
    },
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIST_EXTRACT_TIMEOUT_MS);
  let llmRes: Response;
  try {
    llmRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === "AbortError") {
      console.error("[extract-list:llm] timeout");
      res.status(504).json({ error: "List extraction timed out" });
      return;
    }
    console.error("[extract-list:llm]", e);
    res.status(502).json({ error: "List extraction failed" });
    return;
  }
  clearTimeout(timer);
  if (!llmRes.ok) {
    const errText = await llmRes.text().catch(() => "");
    console.error("[extract-list:llm]", llmRes.status, errText.slice(0, 300));
    res.status(502).json({ error: "List extraction failed" });
    return;
  }
  const data: any = await llmRes.json().catch(() => ({}));
  const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  let parsed: { items?: Array<{ title?: string; description?: string }> } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    // Strip markdown fences just in case the model emitted them despite
    // JSON mode.
    const stripped = text.replace(/```json|```/g, "").trim();
    try {
      parsed = JSON.parse(stripped);
    } catch (err) {
      console.error("[extract-list:parse]", err, "raw:", text.slice(0, 300));
      res.status(502).json({ error: "List parse failed" });
      return;
    }
  }
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map((item) => ({
      title: typeof item?.title === "string" ? item.title.trim().slice(0, 120) : "",
      description:
        typeof item?.description === "string" && item.description.trim().length > 0
          ? item.description.trim().slice(0, 500)
          : undefined,
    }))
    .filter((item) => item.title.length > 0)
    .slice(0, 200);
  res.status(200).json({ items });
}

// ── Transcription (Groq Whisper) ─────────────────────────────────────────────

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

async function handleTranscribe(req: ApiRequest, res: ApiResponse): Promise<void> {
  // Diagnostic timing — log breakdown so we can split cold-start, multipart
  // build, Groq round-trip, and retry overhead. Search Vercel function logs
  // for "[transcribe] timing" to graph p50/p95.
  const t0 = Date.now();
  if (!GROQ_API_KEY) {
    res.status(500).json({ error: "Voice transcription not configured" });
    return;
  }
  // Audio arrives as a raw binary body (Vercel's bodyParser passes
  // non-JSON/text content-types through as a Buffer). The previous JSON
  // path base64-encoded the audio twice (client encode + server decode)
  // and inflated bytes by 33% — sending the Blob directly skips both
  // hops. mimeType + language ride on the query string.
  const rawMime =
    typeof req.query?.mime === "string"
      ? (req.query.mime as string)
      : typeof req.headers["content-type"] === "string"
        ? (req.headers["content-type"] as string).split(";")[0].trim()
        : "";
  // Whitelist against the known audio extensions. Without this, an attacker
  // can pass mime=audio/webm%0d%0a or `audio/webm";boundary=` to inject CRLF
  // into the outbound multipart Content-Type / filename and corrupt the
  // request to Groq.
  const mimeType = rawMime && _mimeToExt(rawMime) ? rawMime : "";
  const language = typeof req.query?.language === "string" ? (req.query.language as string) : "";
  // Strip any non-letter chars from language too — same multipart-injection
  // surface, lower payoff but trivial to harden.
  const safeLanguage = /^[a-z]{2,5}$/i.test(language) ? language : "";
  if (!mimeType) {
    res
      .status(400)
      .json({ error: "Unsupported audio mime type. Use audio/webm, audio/ogg, audio/mp4, audio/mpeg, audio/wav, audio/flac, or audio/m4a." });
    return;
  }
  let audioBuffer: Buffer;
  if (Buffer.isBuffer(req.body)) {
    audioBuffer = req.body;
  } else if (req.body instanceof Uint8Array) {
    audioBuffer = Buffer.from(req.body);
  } else if (typeof req.body === "string") {
    audioBuffer = Buffer.from(req.body, "binary");
  } else {
    res.status(400).json({ error: "Audio body must be raw binary (Content-Type: audio/*)" });
    return;
  }
  if (audioBuffer.byteLength === 0) {
    res.status(400).json({ error: "Empty audio body" });
    return;
  }
  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    res.status(413).json({ error: "Audio too large (max 24 MB)" });
    return;
  }

  const model = "whisper-large-v3-turbo";
  const ext = _mimeToExt(mimeType) || "webm";
  const boundary = `----WebKitFormBoundary${crypto.randomUUID().replace(/-/g, "")}`;
  const CRLF = "\r\n";
  const modelField = `--${boundary}${CRLF}Content-Disposition: form-data; name="model"${CRLF}${CRLF}${model}`;
  const langField = safeLanguage
    ? `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="language"${CRLF}${CRLF}${safeLanguage}`
    : "";
  const responseFormatField = `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="response_format"${CRLF}${CRLF}json`;
  const fileHeader = `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="audio.${ext}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`;
  const closingBoundary = `${CRLF}--${boundary}--`;
  const enc = new TextEncoder();
  const bodyParts: Uint8Array[] = [
    enc.encode(modelField),
    enc.encode(langField),
    enc.encode(responseFormatField),
    enc.encode(fileHeader),
    audioBuffer,
    enc.encode(closingBoundary),
  ];
  const totalLength = bodyParts.reduce((sum, p) => sum + p.byteLength, 0);
  const bodyBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of bodyParts) {
    bodyBytes.set(part, offset);
    offset += part.byteLength;
  }

  // Retry transient failures (5xx + 429 + network) with exponential backoff
  // — same pattern as api/_lib/aiProvider.ts. Without this a single Groq
  // 503 dropped voice notes silently; the user re-recorded thinking they
  // misheard the toast.
  const tBuild = Date.now();
  const TRANSCRIBE_DELAYS = [400, 1200, 3000];
  let whisperRes: Response | null = null;
  let lastNetworkErr: unknown = null;
  let retryAttempts = 0;
  for (let attempt = 0; attempt <= TRANSCRIBE_DELAYS.length; attempt++) {
    retryAttempts = attempt;
    try {
      whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: bodyBytes,
      });
      const transient = whisperRes.status >= 500 || whisperRes.status === 429;
      if (!transient || attempt === TRANSCRIBE_DELAYS.length) break;
      console.warn(
        `[transcribe] HTTP ${whisperRes.status} on attempt ${attempt + 1}/${TRANSCRIBE_DELAYS.length + 1} — retrying in ${TRANSCRIBE_DELAYS[attempt]}ms`,
      );
    } catch (err: any) {
      lastNetworkErr = err;
      if (attempt === TRANSCRIBE_DELAYS.length) break;
      console.warn(
        `[transcribe] network error on attempt ${attempt + 1}/${TRANSCRIBE_DELAYS.length + 1} — retrying in ${TRANSCRIBE_DELAYS[attempt]}ms: ${err?.message ?? err}`,
      );
    }
    await new Promise((r) => setTimeout(r, TRANSCRIBE_DELAYS[attempt]));
  }
  if (!whisperRes) {
    console.error("[transcribe] network error after retries:", (lastNetworkErr as any)?.message);
    res.status(502).json({ error: "Failed to reach transcription service" });
    return;
  }
  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    console.error(`[transcribe] error ${whisperRes.status}: ${errText}`);
    res
      .status(whisperRes.status === 401 ? 401 : 502)
      .json({
        error:
          whisperRes.status === 401
            ? "Transcription service authentication failed"
            : "Transcription failed",
      });
    return;
  }
  const tGroq = Date.now();
  const data: any = await whisperRes.json();
  const tDone = Date.now();
  console.log(
    `[transcribe] timing — total=${tDone - t0}ms build=${tBuild - t0}ms groq=${tGroq - tBuild}ms parse=${tDone - tGroq}ms retries=${retryAttempts} bytes=${audioBuffer.byteLength} mime=${mimeType} textLen=${(data.text || "").length}`,
  );
  res
    .status(200)
    .json({ text: data.text || "", audioBytes: audioBuffer.byteLength, provider: "groq", model });
}

function _mimeToExt(mime: string): string | null {
  const m = mime.split(";")[0].trim();
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
    "audio/m4a": "m4a",
  };
  return map[m] || null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default withAuth(
  {
    methods: ["POST"],
    rateLimit: (req) => ((req.query.action as string) === "transcribe" ? 10 : 40),
    cacheControl: "no-store",
  },
  async ({ req, res, user }) => {
    const action = (req.query.action as string) || "";
    const reqId = getReqId(req);
    res.setHeader("x-request-id", reqId);

    // Per-action rate limits (separate budget per tool type)
    const actionLimits: Record<string, number> = {
      chat: 20,
      split: 15,
      complete: 30,
      transcribe: 10,
      "extract-file": 20,
      // List extraction is heavier (file extract + LLM call). Lower
      // limit so a runaway client can't drain quota in one minute.
      "extract-list-from-file": 6,
    };
    const actionLimit = actionLimits[action];
    if (actionLimit && !(await rateLimit(req, actionLimit, 60_000, action))) {
      return res.status(429).json({ error: "Too many requests", action });
    }

    if (action === "transcribe") return handleTranscribe(req, res);

    if (action === "split") return handleSplit(req, res, user.id);

    if (action === "extract-file") {
      const geminiKey = await resolveGeminiKey(user.id);
      if (!geminiKey) return res.status(500).json({ error: "AI not configured" });
      return handleExtractFile(req, res, geminiKey);
    }

    if (action === "extract-list-from-file") {
      const geminiKey = await resolveGeminiKey(user.id);
      if (!geminiKey) return res.status(500).json({ error: "AI not configured" });
      // Quota gate — list extraction fires a Gemini call. Free-tier
      // users with no BYOK key are blocked at provider resolution time
      // (no key → no extraction). Paid tiers count this against the
      // captures budget.
      const { tier, hasKey } = await resolveSettingsRaw(user.id);
      if (tier === "free" && !hasKey) {
        return res.status(402).json({
          error: "no_ai_provider",
          message: "Add an API key in Settings or upgrade to Pro.",
        });
      }
      try {
        const check = await checkAndIncrement(user.id, "captures", tier, hasKey);
        if (!check.allowed) {
          return res.status(429).json({
            error: "monthly_limit_reached",
            action: "captures",
            remaining: 0,
            upgrade_url: "/settings?tab=billing",
          });
        }
      } catch {
        return res.status(503).json({ error: "quota_unavailable", retryAfter: 10 });
      }
      return handleExtractListFromFile(req, res, geminiKey);
    }

    if (action === "chat") {
      const provider = await resolveProvider(user.id, true);
      if (!provider)
        return res
          .status(402)
          .json({
            error: "no_ai_provider",
            message: "Add an API key in Settings or upgrade to Pro.",
          });
      let quotaCtx: { plan: string; hasKey: boolean } | undefined;
      if (provider.provider === "gemini-managed") {
        const { tier, hasKey } = await resolveSettingsRaw(user.id);
        let check: Awaited<ReturnType<typeof checkAndIncrement>>;
        try {
          check = await checkAndIncrement(user.id, "chats", tier, hasKey);
        } catch {
          return void res.status(503).json({ error: "quota_unavailable", retryAfter: 10 });
        }
        if (!check.allowed) {
          return void res.status(429).json({
            error: "monthly_limit_reached",
            action: "chats",
            remaining: 0,
            upgrade_url: "/settings?tab=billing",
          });
        }
        quotaCtx = { plan: tier, hasKey };
      }
      return handleChat(req, res, user, provider, reqId, quotaCtx);
    }

    // Default: text completion (enrichment parsing, insight, etc.)
    const { messages, max_tokens, system, json } = bodyObject(req.body);
    if (!Array.isArray(messages) || messages.length === 0)
      return res.status(400).json({ error: "messages must be a non-empty array" });
    if (messages.length > 50) return res.status(400).json({ error: "Too many messages" });
    for (const msg of messages) {
      if (!msg || typeof msg !== "object")
        return res.status(400).json({ error: "Invalid message format" });
      if (!["user", "assistant"].includes(msg.role))
        return res.status(400).json({ error: "Message role must be 'user' or 'assistant'" });
      if (typeof msg.content !== "string")
        return res.status(400).json({ error: "Message content must be plain text strings only" });
    }
    if (
      max_tokens !== undefined &&
      (typeof max_tokens !== "number" || max_tokens < 1 || max_tokens > 4096)
    ) {
      return res.status(400).json({ error: "Invalid max_tokens" });
    }

    const provider = await resolveProvider(user.id);
    if (!provider)
      return res
        .status(402)
        .json({
          error: "no_ai_provider",
          message: "Add an API key in Settings or upgrade to Pro.",
        });
    return handleCompletion(
      res,
      {
        messages,
        max_tokens,
        system: typeof system === "string" ? system : undefined,
        json: typeof json === "boolean" ? json : undefined,
      },
      provider,
    );
  },
);
