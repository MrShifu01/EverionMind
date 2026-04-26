import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import SettingsRow, { SettingsButton } from "./SettingsRow";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ClaudeCodeTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [revealedKey, setRevealedKey] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const hdrs = await authHeaders();
      const r = await fetch("/api/user-data?resource=api_keys", { headers: hdrs });
      if (r.ok) setKeys(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function generate() {
    if (!newKeyName.trim()) return;
    setGenerating(true);
    setError("");
    try {
      const hdrs = await authHeaders();
      const r = await fetch("/api/user-data?resource=api_keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Failed to generate key");
        return;
      }
      setRevealedKey({ name: data.name, key: data.key });
      setNewKeyName("");
      setShowForm(false);
      fetchKeys();
    } finally {
      setGenerating(false);
    }
  }

  async function revoke(id: string) {
    const hdrs = await authHeaders();
    await fetch(`/api/user-data?resource=api_keys&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: hdrs,
    });
    fetchKeys();
  }

  function copyKey() {
    if (!revealedKey) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(revealedKey.key).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(revealedKey.key));
    } else {
      fallbackCopy(revealedKey.key);
    }
  }

  function fallbackCopy(text: string) {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // nothing — user will read from the masked input
    }
    document.body.removeChild(el);
  }

  return (
    <div>
      <SettingsRow
        label="API keys"
        hint="connect your AI assistant (Claude Code, ChatGPT, Cursor) to your memory."
      >
        {!showForm && (
          <SettingsButton
            onClick={() => {
              setShowForm(true);
              setError("");
            }}
          >
            + New key
          </SettingsButton>
        )}
      </SettingsRow>

      {/* Generate form */}
      {showForm && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "4px 0 18px",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          <input
            autoFocus
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="key name (e.g. Claude Code)"
            maxLength={100}
            className="design-input f-sans"
          />
          {error && (
            <p className="f-sans" style={{ fontSize: 12, color: "var(--blood)", margin: 0 }}>
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <SettingsButton onClick={generate} disabled={generating || !newKeyName.trim()}>
              {generating ? "Generating…" : "Generate"}
            </SettingsButton>
            <SettingsButton
              onClick={() => {
                setShowForm(false);
                setNewKeyName("");
                setError("");
              }}
            >
              Cancel
            </SettingsButton>
          </div>
        </div>
      )}

      {/* One-time key reveal */}
      {revealedKey && (
        <div
          className="space-y-2 rounded-xl p-3"
          style={{
            background: "var(--color-surface-container)",
            border: "1px solid var(--color-outline-variant)",
          }}
        >
          <p className="text-xs font-semibold" style={{ color: "var(--color-on-surface)" }}>
            {revealedKey.name} — copy this key now, you won't see it again
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              readOnly
              type={showKey ? "text" : "password"}
              value={revealedKey.key}
              style={{
                flex: 1,
                fontFamily: "var(--f-mono)",
                fontSize: 12,
                padding: "6px 10px",
                border: "1px solid var(--line)",
                borderRadius: 8,
                background: "var(--surface)",
                color: "var(--ink)",
              }}
            />
            <button onClick={() => setShowKey(s => !s)} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", cursor: "pointer", color: "var(--ink-soft)" }}>
              {showKey ? "Hide" : "Show"}
            </button>
            <button onClick={copyKey} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", cursor: "pointer", color: "var(--ink-soft)" }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="space-y-1">
            <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
              API base URL — use your key as a Bearer token in every request:
            </p>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 rounded-lg px-3 py-2 text-xs break-all select-all"
                style={{
                  background: "var(--color-surface-container-high)",
                  color: "var(--color-on-surface)",
                }}
              >
                https://everion.smashburgerbar.co.za/v1/
              </code>
              <button
                onClick={() => {
                  navigator.clipboard
                    .writeText("https://everion.smashburgerbar.co.za/v1/")
                    .then(() => {
                      setCopiedSnippet("url");
                      setTimeout(() => setCopiedSnippet(null), 2000);
                    });
                }}
                className="press-scale flex-shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-all"
                style={{
                  background: "var(--color-primary-container)",
                  color: "var(--color-on-primary-container)",
                }}
              >
                {copiedSnippet === "url" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
              Claude Code setup — paste this into Claude Code chat:
            </p>
            <div className="relative">
              <pre
                className="overflow-x-auto rounded-xl px-3 py-2 pr-16 text-xs whitespace-pre-wrap"
                style={{
                  background: "var(--color-surface-container-high)",
                  color: "var(--color-on-surface)",
                }}
              >{`Add the following block to my ~/.claude/CLAUDE.md file (create it if it doesn't exist):

## Everion Memory

My personal memory system: https://everion.smashburgerbar.co.za

Before answering questions about my personal life, business, tasks, people, or stored information, search my memory:
curl -s -X POST https://everion.smashburgerbar.co.za/v1/context -H "Authorization: Bearer ${revealedKey.key}" -H "Content-Type: application/json" -d '{"query": "<relevant topic>", "limit": 8}'

When I share new facts worth remembering, save them without being asked:
curl -s -X POST https://everion.smashburgerbar.co.za/v1/ingest -H "Authorization: Bearer ${revealedKey.key}" -H "Content-Type: application/json" -d '{"title": "<short title>", "content": "<detail>", "type": "note"}'`}</pre>
              <button
                onClick={() => {
                  const prompt = `Add the following block to my ~/.claude/CLAUDE.md file (create it if it doesn't exist):\n\n## Everion Memory\n\nMy personal memory system: https://everion.smashburgerbar.co.za\n\nBefore answering questions about my personal life, business, tasks, people, or stored information, search my memory:\ncurl -s -X POST https://everion.smashburgerbar.co.za/v1/context -H "Authorization: Bearer ${revealedKey.key}" -H "Content-Type: application/json" -d '{"query": "<relevant topic>", "limit": 8}'\n\nWhen I share new facts worth remembering, save them without being asked:\ncurl -s -X POST https://everion.smashburgerbar.co.za/v1/ingest -H "Authorization: Bearer ${revealedKey.key}" -H "Content-Type: application/json" -d '{"title": "<short title>", "content": "<detail>", "type": "note"}'`;
                  navigator.clipboard.writeText(prompt).then(() => {
                    setCopiedSnippet("claude-md");
                    setTimeout(() => setCopiedSnippet(null), 2000);
                  });
                }}
                className="press-scale absolute top-2 right-2 rounded-lg px-2 py-1 text-xs font-semibold transition-all"
                style={{
                  background: "var(--color-primary-container)",
                  color: "var(--color-on-primary-container)",
                }}
              >
                {copiedSnippet === "claude-md" ? "✓" : "Copy"}
              </button>
            </div>
          </div>
          <button
            onClick={() => setRevealedKey(null)}
            className="text-xs underline"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Done
          </button>
        </div>
      )}

      {/* Key list */}
      {loading ? (
        <p
          className="f-serif"
          style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-faint)", margin: "16px 0" }}
        >
          loading…
        </p>
      ) : keys.length === 0 ? (
        <p
          className="f-serif"
          style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-faint)", margin: "16px 0" }}
        >
          no active keys yet.
        </p>
      ) : (
        <div>
          {keys.map((k, i) => (
            <SettingsRow
              key={k.id}
              label={k.name}
              hint={`${k.key_prefix}… · created ${formatDate(k.created_at)} · last used ${formatDate(k.last_used_at)}`}
              last={i === keys.length - 1}
            >
              <SettingsButton onClick={() => revoke(k.id)} danger>
                Revoke
              </SettingsButton>
            </SettingsRow>
          ))}
        </div>
      )}

      {/* Platform setup guides */}
      {keys.length > 0 && !revealedKey && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
            Setup guides
          </p>

          <details className="group">
            <summary
              className="cursor-pointer py-1 text-xs select-none"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              REST API — all tools & languages →
            </summary>
            <div className="mt-2 space-y-3">
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                All endpoints are <code className="text-xs">POST</code> to{" "}
                <code className="text-xs">
                  https://everion.smashburgerbar.co.za/v1/&lt;action&gt;
                </code>{" "}
                with your key as a Bearer token.
              </p>

              {(
                [
                  {
                    id: "context",
                    label: "Search your memory",
                    body: `{ "query": "what did I note about the project?" }`,
                    response: `{ "results": [{ "id": "…", "title": "…", "content": "…", "similarity": 0.91 }] }`,
                  },
                  {
                    id: "answer",
                    label: "Ask a question (bring your own LLM key)",
                    body: `{ "query": "what's due this week?", "model": "anthropic/claude-haiku-4-5-20251001", "api_key": "<your_llm_key>" }`,
                    response: `{ "answer": "…", "sources": [{ "id": "…", "title": "…" }] }`,
                  },
                  {
                    id: "ingest",
                    label: "Save a new entry",
                    body: `{ "title": "Meeting notes", "content": "…", "type": "note", "tags": ["work"] }`,
                    response: `{ "id": "…", "title": "…", "created_at": "…" }`,
                  },
                  {
                    id: "update",
                    label: "Edit an entry",
                    body: `{ "id": "<entry_id>", "content": "updated text" }`,
                    response: `{ "id": "…", "title": "…", "updated_at": "…" }`,
                  },
                  {
                    id: "delete",
                    label: "Delete an entry",
                    body: `{ "id": "<entry_id>" }`,
                    response: `{ "id": "…", "deleted": true }`,
                  },
                ] as { id: string; label: string; body: string; response: string }[]
              ).map(({ id, label, body, response }) => {
                const curl = `curl -X POST https://everion.smashburgerbar.co.za/v1/${id} \\\n  -H "Authorization: Bearer <your_key>" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
                return (
                  <div key={id} className="space-y-1">
                    <p
                      className="text-xs font-semibold"
                      style={{ color: "var(--color-on-surface)" }}
                    >
                      <code className="font-mono" style={{ color: "var(--color-primary)" }}>
                        /{id}
                      </code>{" "}
                      — {label}
                    </p>
                    <div className="relative">
                      <pre
                        className="overflow-x-auto rounded-xl px-3 py-2 pr-16 text-xs"
                        style={{
                          background: "var(--color-surface-container-high)",
                          color: "var(--color-on-surface)",
                        }}
                      >
                        {curl}
                      </pre>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(curl).then(() => {
                            setCopiedSnippet(id);
                            setTimeout(() => setCopiedSnippet(null), 2000);
                          });
                        }}
                        className="press-scale absolute top-2 right-2 rounded-lg px-2 py-1 text-xs font-semibold transition-all"
                        style={{
                          background: "var(--color-primary-container)",
                          color: "var(--color-on-primary-container)",
                        }}
                      >
                        {copiedSnippet === id ? "✓" : "Copy"}
                      </button>
                    </div>
                    <p
                      className="pl-1 font-mono text-xs opacity-60"
                      style={{ color: "var(--color-on-surface)" }}
                    >
                      Returns: {response}
                    </p>
                  </div>
                );
              })}
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer py-1 text-xs select-none"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              Claude Code (REST API via CLAUDE.md) →
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                Paste this into Claude Code chat — it will set up your{" "}
                <code className="text-xs">~/.claude/CLAUDE.md</code> automatically:
              </p>
              <div className="relative">
                <pre
                  className="overflow-x-auto rounded-xl px-3 py-2 pr-16 text-xs whitespace-pre-wrap"
                  style={{
                    background: "var(--color-surface-container-high)",
                    color: "var(--color-on-surface)",
                  }}
                >{`Add the following block to my ~/.claude/CLAUDE.md file (create it if it doesn't exist):

## Everion Memory

My personal memory system: https://everion.smashburgerbar.co.za

Before answering questions about my personal life, business, tasks, people, or stored information, search my memory:
curl -s -X POST https://everion.smashburgerbar.co.za/v1/context -H "Authorization: Bearer <your_key>" -H "Content-Type: application/json" -d '{"query": "<relevant topic>", "limit": 8}'

When I share new facts worth remembering, save them without being asked:
curl -s -X POST https://everion.smashburgerbar.co.za/v1/ingest -H "Authorization: Bearer <your_key>" -H "Content-Type: application/json" -d '{"title": "<short title>", "content": "<detail>", "type": "note"}'`}</pre>
                <button
                  onClick={() => {
                    const prompt = `Add the following block to my ~/.claude/CLAUDE.md file (create it if it doesn't exist):\n\n## Everion Memory\n\nMy personal memory system: https://everion.smashburgerbar.co.za\n\nBefore answering questions about my personal life, business, tasks, people, or stored information, search my memory:\ncurl -s -X POST https://everion.smashburgerbar.co.za/v1/context -H "Authorization: Bearer <your_key>" -H "Content-Type: application/json" -d '{"query": "<relevant topic>", "limit": 8}'\n\nWhen I share new facts worth remembering, save them without being asked:\ncurl -s -X POST https://everion.smashburgerbar.co.za/v1/ingest -H "Authorization: Bearer <your_key>" -H "Content-Type: application/json" -d '{"title": "<short title>", "content": "<detail>", "type": "note"}'`;
                    navigator.clipboard.writeText(prompt).then(() => {
                      setCopiedSnippet("claude-md-guide");
                      setTimeout(() => setCopiedSnippet(null), 2000);
                    });
                  }}
                  className="press-scale absolute top-2 right-2 rounded-lg px-2 py-1 text-xs font-semibold transition-all"
                  style={{
                    background: "var(--color-primary-container)",
                    color: "var(--color-on-primary-container)",
                  }}
                >
                  {copiedSnippet === "claude-md-guide" ? "✓" : "Copy"}
                </button>
              </div>
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                Replace <code className="text-xs">&lt;your_key&gt;</code> with your actual{" "}
                <code className="text-xs">em_</code> key before pasting.
              </p>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer py-1 text-xs select-none"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              Claude Code / Cursor (MCP) →
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                One-liner install — replace <code className="text-xs">&lt;your_key&gt;</code> then
                run in terminal:
              </p>
              <div className="relative">
                <pre
                  className="overflow-x-auto rounded-xl px-3 py-2 pr-16 text-xs"
                  style={{
                    background: "var(--color-surface-container-high)",
                    color: "var(--color-on-surface)",
                  }}
                >{`claude mcp add --transport http everionmind https://everion.smashburgerbar.co.za/api/mcp \\\n  -H "Authorization: Bearer <your_key>"`}</pre>
                <button
                  onClick={() => {
                    navigator.clipboard
                      .writeText(
                        `claude mcp add --transport http everionmind https://everion.smashburgerbar.co.za/api/mcp -H "Authorization: Bearer <your_key>"`,
                      )
                      .then(() => {
                        setCopiedSnippet("mcp-install");
                        setTimeout(() => setCopiedSnippet(null), 2000);
                      });
                  }}
                  className="press-scale absolute top-2 right-2 rounded-lg px-2 py-1 text-xs font-semibold transition-all"
                  style={{
                    background: "var(--color-primary-container)",
                    color: "var(--color-on-primary-container)",
                  }}
                >
                  {copiedSnippet === "mcp-install" ? "✓" : "Copy"}
                </button>
              </div>
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                Or add manually to{" "}
                <code className="text-xs">~/.claude/claude_desktop_config.json</code> (Claude) /{" "}
                <code className="text-xs">~/.cursor/mcp.json</code> (Cursor):
              </p>
              <div className="relative">
                <pre
                  className="overflow-x-auto rounded-xl px-3 py-2 pr-16 text-xs"
                  style={{
                    background: "var(--color-surface-container-high)",
                    color: "var(--color-on-surface)",
                  }}
                >{`{
  "mcpServers": {
    "everionmind": {
      "type": "http",
      "url": "https://everion.smashburgerbar.co.za/api/mcp",
      "headers": {
        "Authorization": "Bearer <your_key>"
      }
    }
  }
}`}</pre>
                <button
                  onClick={() => {
                    navigator.clipboard
                      .writeText(
                        `{\n  "mcpServers": {\n    "everionmind": {\n      "type": "http",\n      "url": "https://everion.smashburgerbar.co.za/api/mcp",\n      "headers": {\n        "Authorization": "Bearer <your_key>"\n      }\n    }\n  }\n}`,
                      )
                      .then(() => {
                        setCopiedSnippet("mcp-json");
                        setTimeout(() => setCopiedSnippet(null), 2000);
                      });
                  }}
                  className="press-scale absolute top-2 right-2 rounded-lg px-2 py-1 text-xs font-semibold transition-all"
                  style={{
                    background: "var(--color-primary-container)",
                    color: "var(--color-on-primary-container)",
                  }}
                >
                  {copiedSnippet === "mcp-json" ? "✓" : "Copy"}
                </button>
              </div>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer py-1 text-xs select-none"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              ChatGPT (Custom GPT Actions) →
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                1. Open ChatGPT → Explore GPTs → Create a GPT → Configure → Add actions.
                <br />
                2. Import from URL:
              </p>
              <code
                className="block rounded-lg px-3 py-2 text-xs break-all"
                style={{
                  background: "var(--color-surface-container-high)",
                  color: "var(--color-on-surface)",
                }}
              >
                https://everion.smashburgerbar.co.za/openapi.json
              </code>
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                3. Under Authentication, choose <strong>API Key</strong>, type{" "}
                <strong>Bearer</strong>, paste your key.
                <br />
                4. Save and test: ask your GPT "what's in my Everion?" or "what's due this week?".
              </p>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer py-1 text-xs select-none"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              Saving to Everion via chat →
            </summary>
            <div className="mt-2 space-y-1">
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                Once connected, tell your AI assistant to save information naturally:
              </p>
              <ul
                className="list-none space-y-1 pl-2 text-xs"
                style={{ color: "var(--color-on-surface)" }}
              >
                <li>"Add this to Everion: John's number is 082 555 1234"</li>
                <li>"Save this idea to my memory: [your idea]"</li>
                <li>"Store this recipe in Everion"</li>
                <li>"Remember that my passport expires 2027-03-15"</li>
              </ul>
              <p className="mt-1 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                The AI will use the <strong>create_entry</strong> tool to save it with the right
                type and tags.
              </p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
