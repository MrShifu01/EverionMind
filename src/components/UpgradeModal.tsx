import { authFetch } from "../lib/authFetch";
import { useSubscription } from "../lib/useSubscription";

interface Props {
  action: "captures" | "chats" | "voice" | "improve";
  onClose: () => void;
}

const ACTION_LABEL: Record<Props["action"], string> = {
  captures: "AI-assisted captures",
  chats:    "AI chats",
  voice:    "voice notes",
  improve:  "improve scans",
};

async function startCheckout(plan: "starter" | "pro") {
  const r = await authFetch("/api/stripe-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, interval: "month" }),
  });
  if (!r.ok) return;
  const { url } = await r.json();
  if (url) window.location.href = url;
}

export default function UpgradeModal({ action, onClose }: Props) {
  const { tier } = useSubscription();
  const label = ACTION_LABEL[action];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: "var(--surface-high)",
          border: "1px solid var(--line-soft)",
          borderRadius: 18,
          boxShadow: "var(--lift-3)",
          padding: "28px 28px 24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="f-serif" style={{ fontSize: 20, fontWeight: 450, color: "var(--ink)", marginBottom: 6 }}>
          Monthly limit reached
        </div>
        <div className="f-sans" style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 22 }}>
          You've used all your {label} for this month. Upgrade to continue.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {tier !== "pro" && (
            <button
              className="press f-sans"
              onClick={() => startCheckout("pro")}
              style={{
                padding: "11px 0",
                borderRadius: 10,
                border: "none",
                background: "var(--ember)",
                color: "var(--ember-ink)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Upgrade to Pro — $9.99 / mo
            </button>
          )}
          {tier === "free" && (
            <button
              className="press f-sans"
              onClick={() => startCheckout("starter")}
              style={{
                padding: "11px 0",
                borderRadius: 10,
                border: "1px solid var(--line-soft)",
                background: "transparent",
                color: "var(--ink)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Upgrade to Starter — $4.99 / mo
            </button>
          )}
        </div>

        <div className="f-sans" style={{ fontSize: 11, color: "var(--ink-ghost)", textAlign: "center" }}>
          Or{" "}
          <a
            href="/settings?tab=ai"
            style={{ color: "var(--ink-faint)", textDecoration: "underline" }}
            onClick={onClose}
          >
            use your own API key
          </a>{" "}
          to bypass limits for free.
        </div>
      </div>
    </div>
  );
}
