import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";

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
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function ClaudeCodeTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [revealedKey, setRevealedKey] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
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

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

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
      if (!r.ok) { setError(data.error || "Failed to generate key"); return; }
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
    navigator.clipboard.writeText(revealedKey.key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="rounded-2xl border px-4 py-4 space-y-4"
      style={{ background: "var(--color-surface-container-low)", borderColor: "var(--color-outline-variant)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-on-surface)" }}>
            Claude Code Access
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
            Generate keys to chat with your data directly from Claude Code
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setError(""); }}
            className="press-scale flex-shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-all"
            style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          >
            New key
          </button>
        )}
      </div>

      {/* Generate form */}
      {showForm && (
        <div className="space-y-2">
          <input
            autoFocus
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="Key name (e.g. Claude Code)"
            maxLength={100}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{
              background: "var(--color-surface-container)",
              border: "1px solid var(--color-outline-variant)",
              color: "var(--color-on-surface)",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-outline-variant)"; }}
          />
          {error && <p className="text-xs" style={{ color: "var(--color-error)" }}>{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={generating || !newKeyName.trim()}
              className="press-scale rounded-xl px-4 py-2 text-xs font-semibold transition-all disabled:opacity-40"
              style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
            >
              {generating ? "Generating…" : "Generate"}
            </button>
            <button
              onClick={() => { setShowForm(false); setNewKeyName(""); setError(""); }}
              className="press-scale rounded-xl px-4 py-2 text-xs font-medium transition-all"
              style={{ color: "var(--color-on-surface-variant)", border: "1px solid var(--color-outline-variant)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* One-time key reveal */}
      {revealedKey && (
        <div
          className="rounded-xl p-3 space-y-2"
          style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }}
        >
          <p className="text-xs font-semibold" style={{ color: "var(--color-on-surface)" }}>
            {revealedKey.name} — copy this key now, you won't see it again
          </p>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 rounded-lg px-3 py-2 text-xs break-all select-all"
              style={{ background: "var(--color-surface-container-high)", color: "var(--color-on-surface)" }}
            >
              {revealedKey.key}
            </code>
            <button
              onClick={copyKey}
              className="press-scale flex-shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-all"
              style={{ background: "var(--color-primary-container)", color: "var(--color-on-primary-container)" }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            Add to your Claude Code MCP config:{" "}
            <code className="text-xs">Authorization: Bearer {revealedKey.key.slice(0, 12)}…</code>
          </p>
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
        <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>No active keys yet.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"
              style={{ background: "var(--color-surface-container)", border: "1px solid var(--color-outline-variant)" }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--color-on-surface)" }}>{k.name}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-on-surface-variant)" }}>
                  {k.key_prefix}… · Created {formatDate(k.created_at)} · Last used {formatDate(k.last_used_at)}
                </p>
              </div>
              <button
                onClick={() => revoke(k.id)}
                className="press-scale flex-shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
                style={{ color: "var(--color-error)", border: "1px solid var(--color-outline-variant)" }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {/* MCP config snippet */}
      {keys.length > 0 && !revealedKey && (
        <details className="group">
          <summary
            className="cursor-pointer text-xs select-none"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Show Claude Code config →
          </summary>
          <pre
            className="mt-2 rounded-xl p-3 text-xs overflow-x-auto"
            style={{ background: "var(--color-surface-container-high)", color: "var(--color-on-surface)" }}
          >{`{
  "mcpServers": {
    "everionmind": {
      "type": "http",
      "url": "https://everionmind.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <your_key>"
      }
    }
  }
}`}</pre>
        </details>
      )}
    </div>
  );
}
