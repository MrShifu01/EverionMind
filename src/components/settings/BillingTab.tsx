import { useEffect } from "react";
import { useSubscription } from "../../lib/useSubscription";
import { authFetch } from "../../lib/authFetch";
import SettingsRow, { SettingsButton } from "./SettingsRow";

function UsageMeter({
  label,
  used,
  limit,
  pct,
}: {
  label: string;
  used: number;
  limit: number;
  pct?: number;
}) {
  if (limit === 0 || limit >= 9999) return null;
  const p = pct ?? Math.min(100, Math.round((used / limit) * 100));
  const color = p >= 100 ? "var(--blood)" : p >= 90 ? "var(--amber, #f59e0b)" : "var(--moss)";
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        className="f-sans"
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
          marginBottom: 5,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{label}</span>
        <span style={{ color: p >= 90 ? color : "var(--ink-faint)" }}>
          {used} / {limit}
        </span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: "var(--line-soft)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${p}%`,
            background: color,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  tagline,
  accent,
  highlight = false,
  onClick,
}: {
  name: string;
  price: string;
  tagline: string;
  accent: string;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="press f-sans"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px",
        borderRadius: 12,
        border: `1px solid ${highlight ? accent : "var(--line)"}`,
        background: highlight ? `color-mix(in oklch, ${accent} 8%, var(--surface))` : "var(--surface)",
        cursor: "pointer",
        textAlign: "left",
        gap: 12,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: accent,
            marginBottom: 3,
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{tagline}</div>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1 }}>
          {price}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>/ mo</div>
      </div>
    </button>
  );
}

async function startCheckout(plan: "starter" | "pro", interval: "month" | "year" = "month") {
  const r = await authFetch("/api/stripe-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, interval }),
  });
  if (!r.ok) return;
  const { url } = await r.json();
  if (url) window.location.href = url;
}

async function openPortal() {
  const r = await authFetch("/api/stripe-portal", { method: "POST" });
  if (!r.ok) return;
  const { url } = await r.json();
  if (url) window.location.href = url;
}

export default function BillingTab() {
  const { tier, usage, limits, pct, renewalDate, isLoading } = useSubscription();

  // Handle return from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success") {
      params.delete("billing");
      const newUrl = `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  const tierLabel = tier === "max" ? "Max" : tier === "pro" ? "Pro" : tier === "starter" ? "Starter" : "Free";
  const tierColor = tier === "max" || tier === "pro" ? "var(--ember)" : tier === "starter" ? "var(--moss)" : "var(--ink-ghost)";

  if (isLoading) {
    return (
      <div className="f-sans" style={{ fontSize: 13, color: "var(--ink-faint)", padding: "24px 0" }}>
        Loading billing info…
      </div>
    );
  }

  return (
    <div>
      {/* Current plan */}
      <SettingsRow label="Current plan">
        <span
          className="f-sans"
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: tierColor,
            background: `${tierColor}18`,
            padding: "3px 8px",
            borderRadius: 5,
          }}
        >
          {tierLabel}
        </span>
        {renewalDate && tier !== "free" && (
          <span className="f-sans" style={{ fontSize: 11, color: "var(--ink-ghost)", marginLeft: 8 }}>
            expires {new Date(renewalDate).toLocaleDateString()}
          </span>
        )}
      </SettingsRow>

      {/* Usage meters (only for paid tiers) */}
      {tier !== "free" && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: 12,
            padding: "16px 18px",
            marginTop: 16,
            marginBottom: 16,
          }}
        >
          <div
            className="f-sans"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
              marginBottom: 14,
            }}
          >
            Usage this month
          </div>
          <UsageMeter label="Captures"     used={usage.captures} limit={limits.captures} pct={pct.captures} />
          <UsageMeter label="Chats"        used={usage.chats}    limit={limits.chats}    pct={pct.chats}    />
          <UsageMeter label="Voice notes"  used={usage.voice}    limit={limits.voice}    pct={pct.voice}    />
          <UsageMeter label="Improve scans" used={usage.improve} limit={limits.improve}  pct={pct.improve}  />
        </div>
      )}

      {/* Upgrade / manage buttons */}
      {tier === "free" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          <PlanCard
            name="Starter"
            price="$4.99"
            tagline="Platform AI + 500 captures / mo"
            accent="var(--moss)"
            onClick={() => startCheckout("starter")}
          />
          <PlanCard
            name="Pro"
            price="$9.99"
            tagline="Sonnet AI + 2 000 captures + all features"
            accent="var(--ember)"
            highlight
            onClick={() => startCheckout("pro")}
          />
        </div>
      )}
      {tier === "starter" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          <PlanCard
            name="Pro"
            price="$9.99"
            tagline="Sonnet AI + 2 000 captures + all features"
            accent="var(--ember)"
            highlight
            onClick={() => startCheckout("pro")}
          />
          <div style={{ marginTop: 4 }}>
            <SettingsButton onClick={openPortal}>Manage subscription</SettingsButton>
          </div>
        </div>
      )}
      {(tier === "pro" || tier === "max") && (
        <div style={{ marginTop: 16 }}>
          <SettingsButton onClick={openPortal}>Manage subscription</SettingsButton>
        </div>
      )}

      {/* Plan comparison */}
      <div
        style={{
          marginTop: 28,
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {(["", "Free", "Starter", "Pro"] as const).map((h) => (
                <th
                  key={h}
                  className="f-sans"
                  style={{
                    padding: "10px 14px",
                    textAlign: h === "" ? "left" : "center",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: h === tierLabel ? "var(--ember)" : "var(--ink-faint)",
                    borderBottom: "1px solid var(--line-soft)",
                    background: "var(--surface-high)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Price",           free: "$0",  starter: "$4.99/mo", pro: "$9.99/mo" },
              { label: "Raw capture",     free: "✓",   starter: "✓",         pro: "✓"       },
              { label: "BYOK AI",         free: "✓",   starter: "✓",         pro: "✓"       },
              { label: "Platform AI",     free: "—",   starter: "✓",         pro: "✓"       },
              { label: "Captures / mo",   free: "—",   starter: "500",        pro: "2 000"  },
              { label: "Chats / mo",      free: "—",   starter: "200",        pro: "1 000"  },
              { label: "AI models",       free: "—",   starter: "Flash",       pro: "Sonnet" },
              { label: "All features",    free: "—",   starter: "—",          pro: "✓"      },
            ].map((row, i) => (
              <tr key={row.label} style={{ background: i % 2 === 0 ? "transparent" : "var(--surface-high)" }}>
                <td className="f-sans" style={{ padding: "9px 14px", fontSize: 12, color: "var(--ink-soft)" }}>
                  {row.label}
                </td>
                {(["free", "starter", "pro"] as const).map((t) => (
                  <td
                    key={t}
                    className="f-sans"
                    style={{
                      padding: "9px 14px",
                      fontSize: 12,
                      textAlign: "center",
                      color: row[t] === "—" ? "var(--ink-ghost)" : row[t] === "✓" ? "var(--moss)" : "var(--ink)",
                      fontWeight: t === tier ? 600 : 400,
                    }}
                  >
                    {row[t]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
