import { useTheme } from "../ThemeContext";

export default function MobileHeader({
  brainName,
  brainEmoji,
  onToggleTheme,
  isDark,
  isOnline,
  pendingCount,
  children,
}) {
  const { t } = useTheme();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: t.bg,
      }}
    >
      {/* Brain identity */}
      <div
        style={{
          width: 36,
          height: 36,
          minWidth: 36,
          borderRadius: 10,
          background: "linear-gradient(135deg, #4ECDC4, #45B7D1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
        }}
      >
        {brainEmoji}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: t.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {brainName}
        </div>
        {(!isOnline || pendingCount > 0) && (
          <div
            style={{
              fontSize: 10,
              color: !isOnline ? t.error : t.accent,
              fontWeight: 600,
            }}
          >
            {!isOnline
              ? "Offline"
              : `${pendingCount} pending sync`}
          </div>
        )}
      </div>

      {/* Injected content (e.g. BrainSwitcher) */}
      {children}

      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        style={{
          width: 44,
          height: 44,
          minWidth: 44,
          minHeight: 44,
          borderRadius: 10,
          border: `1px solid ${t.border}`,
          background: t.surface,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          padding: 0,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {isDark ? "\uD83C\uDF19" : "\u2600\uFE0F"}
      </button>
    </header>
  );
}
