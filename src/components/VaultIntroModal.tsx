interface VaultIntroModalProps {
  onDismiss: () => void;
}

export function VaultIntroModal({ onDismiss }: VaultIntroModalProps) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      style={{ background: "var(--color-scrim)" }}
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl border px-6 pt-6 pb-24 sm:rounded-3xl sm:p-6 max-h-[90vh] overflow-y-auto"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-outline-variant)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl"
            style={{ background: "color-mix(in oklch, var(--color-primary) 12%, transparent)" }}>
            🔐
          </div>
          <h2 className="text-on-surface text-lg font-semibold" style={{ fontFamily: "'Lora', Georgia, serif" }}>
            Your Private Vault
          </h2>
          <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            A completely separate, encrypted space for your most sensitive data.
          </p>
        </div>

        <div className="mb-5 space-y-3">
          {[
            {
              icon: "🔒",
              title: "End-to-end encrypted",
              desc: "Everything is encrypted on your device before it leaves. Not even we can read it.",
            },
            {
              icon: "🤖",
              title: "AI never touches it",
              desc: "Vault contents are never sent to AI models — not for classification, not for chat.",
            },
            {
              icon: "🗝️",
              title: "Your passphrase, your data",
              desc: "AES-256 encryption with a passphrase only you know. Set it up once in the Vault section.",
            },
            {
              icon: "📋",
              title: "What to store here",
              desc: "Passwords, PINs, API keys, credit card details, bank accounts, recovery codes.",
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="text-xl leading-none shrink-0 mt-0.5">{item.icon}</span>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--color-on-surface)" }}>{item.title}</p>
                <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onDismiss}
          className="w-full rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
