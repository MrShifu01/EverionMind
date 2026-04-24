import { useSubscription, type UsageAction } from "../lib/useSubscription";

interface Props {
  action: UsageAction;
  onUpgradeClick?: () => void;
}

export default function UsageBanner({ action, onUpgradeClick }: Props) {
  const { pct, tier } = useSubscription();
  const p = pct[action];

  if (tier === "free" || p === undefined || p < 90) return null;

  const isAtLimit = p >= 100;
  const actionLabel = { captures: "captures", chats: "chats", voice: "voice notes", improve: "improve scans" }[action];

  return (
    <div
      className="f-sans"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "9px 14px",
        borderRadius: 8,
        background: isAtLimit ? "var(--blood-soft, #fee2e2)" : "var(--amber-soft, #fef3c7)",
        border: `1px solid ${isAtLimit ? "var(--blood, #ef4444)" : "var(--amber, #f59e0b)"}`,
        fontSize: 12,
        color: isAtLimit ? "var(--blood, #ef4444)" : "var(--amber-dark, #92400e)",
        marginBottom: 12,
      }}
    >
      <span>
        {isAtLimit
          ? `Monthly ${actionLabel} limit reached.`
          : `You've used ${p}% of your monthly ${actionLabel}.`}
      </span>
      {onUpgradeClick && (
        <button
          className="press"
          onClick={onUpgradeClick}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            color: "inherit",
            textDecoration: "underline",
            padding: 0,
            flexShrink: 0,
          }}
        >
          Upgrade
        </button>
      )}
    </div>
  );
}
