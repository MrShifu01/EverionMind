import { useState, useEffect } from "react";
import TrashView from "../../views/TrashView";
import type { Brain } from "../../types";
import { KEYS } from "../../lib/storageKeys";

function fmt(n: number) {
  return n.toLocaleString();
}
function fmtBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
function fmtUsd(usd: number) {
  if (usd === 0) return null;
  return `~$${usd < 0.0001 ? usd.toExponential(2) : usd.toFixed(4)}`;
}

const PROVIDER_LABELS: Record<string, string> = {
  groq: "Groq",
  google: "Google",
};

function label(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider;
}

function Row({ name, value, sub }: { name: string; value: string; sub?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span style={{ color: "var(--color-on-surface-variant)" }}>{name}</span>
      <span className="text-on-surface text-right">
        {value}
        {sub && <span style={{ color: "var(--color-outline)", marginLeft: 4 }}>{sub}</span>}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold" style={{ color: "var(--color-outline)" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function UsagePanel() {
  const [bd, setBd] = useState<Awaited<
    ReturnType<typeof import("../../lib/usageTracker").getMonthlyBreakdown>
  > | null>(null);
  const [entryCount, setEntryCount] = useState(0);
  const [entriesThisMonth, setEntriesThisMonth] = useState(0);

  useEffect(() => {
    import("../../lib/usageTracker").then((m) => setBd(m.getMonthlyBreakdown()));
    try {
      const cached = localStorage.getItem(KEYS.ENTRIES_CACHE);
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr)) {
          setEntryCount(arr.length);
          const month = new Date().toISOString().slice(0, 7);
          setEntriesThisMonth(arr.filter((e: any) => e.created_at?.startsWith(month)).length);
        }
      }
    } catch (err) {
      console.error("[StorageTab]", err);
    }
  }, []);

  const supabaseEstimateBytes = entryCount * 5 * 1024;
  const txProviders = bd ? Object.keys(bd.transcription.byProvider) : [];

  return (
    <div
      className="space-y-4 rounded-2xl border p-4"
      style={{
        background: "var(--color-surface-container)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      <p className="text-on-surface text-sm font-semibold">Usage this month</p>

      <div className="space-y-4">
        {/* Memory */}
        <Section title="Memory">
          <Row name="Added this month" value={fmt(entriesThisMonth)} />
          <Row name="Total entries" value={fmt(entryCount)} />
          <Row name="Est. storage" value={fmtBytes(supabaseEstimateBytes)} sub="~5 KB/entry" />
        </Section>

        {/* Voice transcription — only shown if used */}
        {bd && bd.transcription.calls > 0 && (
          <Section title="Voice transcription">
            <Row name="Sessions" value={fmt(bd.transcription.calls)} />
            <Row name="Audio processed" value={fmtBytes(bd.transcription.audioBytes)} />
            {txProviders.map((p) => {
              const s = bd.transcription.byProvider[p];
              const cost = fmtUsd(s.estimatedUsd);
              return (
                <Row
                  key={p}
                  name={label(p)}
                  value={`${fmt(s.calls)} sessions, ${fmtBytes(s.audioBytes)}`}
                  sub={cost}
                />
              );
            })}
          </Section>
        )}

        {/* Embeddings — only shown if used */}
        {bd && bd.embedding.calls > 0 && (
          <Section title="AI searches">
            <Row name="Queries processed" value={fmt(bd.embedding.calls)} />
          </Section>
        )}
      </div>
    </div>
  );
}

interface Props {
  activeBrain?: Brain;
}


export default function StorageTab({ activeBrain }: Props) {
  const [showTrash, setShowTrash] = useState(false);

  return (
    <>
      <UsagePanel />

      <div
        className="space-y-3 rounded-2xl border p-4"
        style={{
          background: "var(--color-surface-container-high)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        <p className="text-on-surface text-sm font-semibold">Data & Storage</p>
        <button
          onClick={() => setShowTrash((s) => !s)}
          className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{
            background:
              "color-mix(in oklch, var(--color-error) 10%, var(--color-surface-container))",
            color: "var(--color-error)",
            minHeight: 44,
          }}
        >
          {showTrash ? "Hide Trash" : "View Trash"}
        </button>
        {showTrash && (
          <div className="mt-2">
            <TrashView brainId={activeBrain?.id} />
          </div>
        )}
      </div>

      <div
        className="space-y-3 rounded-2xl border p-4"
        style={{
          background: "var(--color-surface-container-high)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        <p className="text-on-surface text-sm font-semibold">Help & Onboarding</p>
        <button
          onClick={() => {
            localStorage.removeItem("openbrain_onboarded");
            window.dispatchEvent(new CustomEvent("openbrain:restart-onboarding"));
          }}
          className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
          style={{
            background: "var(--color-primary-container)",
            color: "var(--color-primary)",
            minHeight: 44,
          }}
        >
          Restart Onboarding
        </button>
      </div>

    </>
  );
}
