import { useState, useEffect, type JSX } from "react";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

// Public status page — no auth required. Polls /api/status every 30s and
// renders a simple up/down per service. Lives at /status (route handled
// in App.tsx ahead of the auth gate).
//
// We don't try to be a full statuspage.io — no incident timeline, no
// historical uptime graph. Just "is the app working RIGHT NOW?" so a user
// who can't load Everion has somewhere to confirm "it's not just me".

interface Status {
  ok: boolean;
  db: boolean;
  ai: boolean;
  ts: string;
}

export default function StatusPage(): JSX.Element {
  useDocumentMeta({
    title: "Status — Everion",
    description:
      "Live system status — see whether Everion's API, database, and AI services are up.",
    canonical: "https://everion.smashburgerbar.co.za/status",
  });
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const r = await fetch("/api/status", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data: Status = await r.json();
        if (cancelled) return;
        setStatus(data);
        setError(null);
        setLastChecked(new Date());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to reach status endpoint");
        setLastChecked(new Date());
      }
    }
    check();
    const id = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const overallUp = !error && status?.ok === true;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--ink)",
        fontFamily: "var(--f-sans)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "60px 20px 40px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560 }}>
        {/* Brand */}
        <div style={{ marginBottom: 28 }}>
          <h1
            className="f-serif"
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 450,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            Everion
          </h1>
          <p
            className="f-serif"
            style={{
              margin: "2px 0 0",
              fontSize: 13,
              color: "var(--ink-faint)",
              fontStyle: "italic",
            }}
          >
            system status
          </p>
        </div>

        {/* Overall summary */}
        <div
          style={{
            border: "1px solid var(--line-soft)",
            borderRadius: 14,
            padding: "20px 22px",
            background: "var(--surface)",
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: error
                  ? "var(--blood, #d23a3a)"
                  : overallUp
                    ? "var(--moss, #4caf50)"
                    : "var(--ember, #c47a2c)",
                flexShrink: 0,
              }}
            />
            <h2
              className="f-serif"
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 450,
                letterSpacing: "-0.005em",
              }}
            >
              {error
                ? "Cannot reach Everion"
                : overallUp
                  ? "All systems operational"
                  : "Partial outage"}
            </h2>
          </div>
          {error && (
            <p
              className="f-serif"
              style={{
                margin: "10px 0 0",
                fontSize: 13,
                fontStyle: "italic",
                color: "var(--ink-faint)",
              }}
            >
              {error}. The app might be down, or your connection might be the issue.
            </p>
          )}
        </div>

        {/* Per-service rows */}
        <div
          style={{
            border: "1px solid var(--line-soft)",
            borderRadius: 14,
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          <ServiceRow label="API" up={!error} />
          <ServiceRow label="Database" up={!error && !!status?.db} />
          <ServiceRow label="AI provider" up={!error && !!status?.ai} last />
        </div>

        {/* Footnote */}
        <p
          className="f-serif"
          style={{
            margin: "20px 4px 0",
            fontSize: 12,
            fontStyle: "italic",
            color: "var(--ink-faint)",
          }}
        >
          {lastChecked
            ? `last checked ${formatTime(lastChecked)}. auto-refreshes every 30 seconds.`
            : "checking…"}
        </p>

        {/* Back link */}
        <div style={{ marginTop: 28 }}>
          <a
            href="/"
            style={{
              fontSize: 13,
              color: "var(--ember, #c47a2c)",
              textDecoration: "none",
              borderBottom: "1px solid currentColor",
              paddingBottom: 1,
            }}
          >
            ← back to Everion
          </a>
        </div>
      </div>
    </div>
  );
}

function ServiceRow({
  label,
  up,
  last,
}: {
  label: string;
  up: boolean;
  last?: boolean;
}): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 22px",
        borderBottom: last ? "none" : "1px solid var(--line-soft)",
      }}
    >
      <span
        className="f-serif"
        style={{ fontSize: 15, fontWeight: 450, letterSpacing: "-0.005em" }}
      >
        {label}
      </span>
      <span
        className="f-sans"
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: up ? "var(--moss, #4caf50)" : "var(--blood, #d23a3a)",
        }}
      >
        {up ? "operational" : "down"}
      </span>
    </div>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
