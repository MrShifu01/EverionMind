import { getTypeConfig } from "../data/constants";
import { useVaultOps } from "../hooks/useVaultOps";
import type { Entry } from "../types";

/* ─── States: loading → setup → show-recovery → locked | recovery | unlocked ─── */

interface VaultViewProps {
  entries: Entry[];
  onSelect: (entry: Entry) => void;
  cryptoKey: CryptoKey | null;
  onVaultUnlock: (key: CryptoKey | null) => void;
  brainId?: string;
  onEntryCreated?: (entry: Entry) => void;
}

export default function VaultView({
  entries,
  onSelect,
  cryptoKey,
  onVaultUnlock,
  brainId,
  onEntryCreated,
}: VaultViewProps) {
  const {
    status,
    passphrase, setPassphrase,
    confirmPhrase, setConfirmPhrase,
    recoveryInput, setRecoveryInput,
    error, setError,
    busy,
    generatedRecoveryKey,
    recoveryCopied, setRecoveryCopied,
    decryptedSecrets,
    revealedIds,
    copyMsg,
    bulkMode, setBulkMode,
    selectedIds, setSelectedIds,
    inputRef,
    showAddSecret, setShowAddSecret,
    addTitle, setAddTitle,
    addContent, setAddContent,
    addTags, setAddTags,
    addMetaRows, setAddMetaRows,
    addError, setAddError, addBusy,
    secrets,
    handleSetup, handleUnlock, handleRecoveryUnlock,
    handleAddSecret, bulkDelete,
    toggleReveal, copyToClipboard,
    lockVault, startAddSecret,
    goToRecovery, backToPassphrase,
    dismissRecoveryKey,
  } = useVaultOps({ entries, cryptoKey, onVaultUnlock, brainId, onEntryCreated });

  // ── Loading ──
  if (status === "loading") {
    return (
      <div
        className="flex flex-col items-center justify-center space-y-3 py-24"
        style={{ background: "var(--color-background)" }}
      >
        <div className="animate-pulse text-4xl">🔐</div>
        <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
          Checking vault...
        </p>
      </div>
    );
  }

  // ── Setup: passphrase creation ──
  if (status === "setup") {
    return (
      <div
        className="flex flex-col items-center space-y-6 px-4 py-12"
        style={{ background: "var(--color-background)" }}
      >
        <div className="space-y-2 text-center">
          <div className="text-4xl">🔐</div>
          <h2
            className="text-on-surface text-xl font-bold"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Set up your Vault
          </h2>
          <p
            className="mx-auto max-w-xs text-sm"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            Choose a passphrase to protect your passwords, credit cards, and sensitive data.
          </p>
        </div>

        <div className="w-full max-w-sm space-y-4">
          <div className="space-y-1">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              Passphrase
            </label>
            <input
              ref={inputRef}
              type="password"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                setError("");
              }}
              placeholder="At least 8 characters"
              className="text-on-surface placeholder:text-on-surface-variant w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm transition-colors outline-none"
              style={{ borderColor: "var(--color-outline-variant)" }}
              onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
            />
          </div>
          <div className="space-y-1">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              Confirm passphrase
            </label>
            <input
              type="password"
              value={confirmPhrase}
              onChange={(e) => {
                setConfirmPhrase(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSetup()}
              placeholder="Enter again to confirm"
              className="text-on-surface placeholder:text-on-surface-variant w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm transition-colors outline-none"
              style={{ borderColor: "var(--color-outline-variant)" }}
              onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
            />
          </div>
        </div>

        {error && (
          <p className="text-center text-sm" style={{ color: "var(--color-error)" }}>
            {error}
          </p>
        )}

        <button
          onClick={handleSetup}
          disabled={busy || passphrase.length < 8}
          className="w-full max-w-sm rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: "var(--color-primary)",
            color: "var(--color-on-primary)",
          }}
        >
          {busy ? "Setting up..." : "Create Vault"}
        </button>
      </div>
    );
  }

  // ── Show recovery key (after setup, before unlocked) ──
  if (status === "show-recovery") {
    return (
      <div
        className="flex flex-col items-center space-y-6 px-4 py-12"
        style={{ background: "var(--color-background)" }}
      >
        <div className="space-y-2 text-center">
          <div className="text-4xl">🗝</div>
          <h2
            className="text-on-surface text-xl font-bold"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Your Recovery Key
          </h2>
          <p
            className="mx-auto max-w-xs text-sm"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            If you ever forget your passphrase, this key is the{" "}
            <strong className="text-on-surface">only way</strong> to recover your secrets. Write it
            down and store it somewhere safe.
          </p>
        </div>

        {/* Recovery key display */}
        <div
          className="w-full max-w-sm rounded-2xl border p-4 text-center"
          style={{
            background: "var(--color-surface-container)",
            borderColor: "var(--color-outline-variant)",
          }}
        >
          <p
            className="font-mono text-base font-bold tracking-widest"
            style={{ color: "var(--color-primary)" }}
          >
            {generatedRecoveryKey}
          </p>
        </div>

        <button
          onClick={() => {
            navigator.clipboard.writeText(generatedRecoveryKey);
            setRecoveryCopied(true);
          }}
          className="w-full max-w-sm rounded-xl border py-2.5 text-sm font-semibold transition-colors hover:bg-white/5"
          style={{
            color: "var(--color-on-surface-variant)",
            borderColor: "var(--color-outline-variant)",
          }}
        >
          {recoveryCopied ? "Copied!" : "📋 Copy recovery key"}
        </button>

        <div
          className="w-full max-w-sm rounded-2xl border p-3"
          style={{
            background: "color-mix(in oklch, var(--color-error) 12%, transparent)",
            borderColor: "color-mix(in oklch, var(--color-error) 20%, transparent)",
          }}
        >
          <p className="text-xs" style={{ color: "var(--color-error)" }}>
            <strong>Write this down now.</strong> This key will not be shown again. Without your
            passphrase or this recovery key, encrypted entries are permanently lost.
          </p>
        </div>

        <button
          onClick={dismissRecoveryKey}
          className="w-full max-w-sm rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            background: "var(--color-primary)",
            color: "var(--color-on-primary)",
          }}
        >
          I've saved my recovery key
        </button>
      </div>
    );
  }

  // ── Locked: passphrase entry ──
  if (status === "locked") {
    return (
      <div
        className="flex flex-col items-center space-y-5 px-4 py-12"
        style={{ background: "var(--color-background)" }}
      >
        <div className="space-y-2 text-center">
          <div className="text-4xl">🔒</div>
          <h2
            className="text-on-surface text-xl font-bold"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Unlock Vault
          </h2>
          <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            Enter your vault passphrase to view secrets
          </p>
        </div>

        <input
          ref={inputRef}
          type="password"
          value={passphrase}
          onChange={(e) => {
            setPassphrase(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          placeholder="Vault passphrase"
          className="text-on-surface placeholder:text-on-surface-variant w-full max-w-sm rounded-xl border bg-transparent px-3 py-2.5 text-sm transition-colors outline-none"
          style={{ borderColor: "var(--color-outline-variant)" }}
          onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
        />

        {error && (
          <p className="text-sm" style={{ color: "var(--color-error)" }}>
            {error}
          </p>
        )}

        <button
          onClick={handleUnlock}
          disabled={busy || !passphrase.trim()}
          className="w-full max-w-sm rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: "var(--color-primary)",
            color: "var(--color-on-primary)",
          }}
        >
          {busy ? "Unlocking..." : "Unlock"}
        </button>

        <button
          onClick={goToRecovery}
          className="text-xs transition-colors hover:underline"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          Forgot passphrase? Use recovery key
        </button>

        {secrets.length > 0 && (
          <p className="text-on-surface-variant text-xs">
            {secrets.length} encrypted {secrets.length === 1 ? "entry" : "entries"} waiting
          </p>
        )}
      </div>
    );
  }

  // ── Recovery: enter recovery key ──
  if (status === "recovery") {
    return (
      <div
        className="flex flex-col items-center space-y-5 px-4 py-12"
        style={{ background: "var(--color-background)" }}
      >
        <div className="space-y-2 text-center">
          <div className="text-4xl">🗝</div>
          <h2
            className="text-on-surface text-xl font-bold"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Recovery Key
          </h2>
          <p className="text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
            Enter the recovery key you saved when you set up your vault
          </p>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={recoveryInput}
          onChange={(e) => {
            setRecoveryInput(e.target.value.toUpperCase());
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleRecoveryUnlock()}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
          className="text-on-surface placeholder:text-on-surface-variant w-full max-w-sm rounded-xl border bg-transparent px-3 py-2.5 text-center font-mono text-sm tracking-wider transition-colors outline-none"
          style={{ borderColor: "var(--color-outline-variant)" }}
          onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
        />

        {error && (
          <p className="text-sm" style={{ color: "var(--color-error)" }}>
            {error}
          </p>
        )}

        <button
          onClick={handleRecoveryUnlock}
          disabled={busy || !recoveryInput.trim()}
          className="w-full max-w-sm rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: "var(--color-primary)",
            color: "var(--color-on-primary)",
          }}
        >
          {busy ? "Recovering..." : "Unlock with recovery key"}
        </button>

        <button
          onClick={backToPassphrase}
          className="text-xs transition-colors hover:underline"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          Back to passphrase
        </button>
      </div>
    );
  }

  // ── Unlocked: show all secrets ──
  return (
    <div
      className="space-y-4 px-4 py-4"
      style={{
        background: "var(--color-background)",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-on-surface text-lg font-bold">🔐 Vault</h2>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            {decryptedSecrets.length} secret {decryptedSecrets.length === 1 ? "entry" : "entries"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startAddSecret}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-on-primary)",
            }}
          >
            ➕ Add Secret
          </button>
          <button
            onClick={() => {
              setBulkMode((b) => !b);
              setSelectedIds(new Set());
            }}
            className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
            style={{
              color: bulkMode ? "var(--color-primary)" : "var(--color-on-surface-variant)",
              borderColor: bulkMode ? "var(--color-primary)" : "var(--color-outline-variant)",
              minHeight: 44,
            }}
          >
            {bulkMode ? "Cancel" : "Select"}
          </button>
          <button
            onClick={lockVault}
            className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
            style={{
              color: "var(--color-on-surface-variant)",
              borderColor: "var(--color-outline-variant)",
            }}
          >
            🔒 Lock
          </button>
        </div>
      </div>

      {copyMsg && (
        <div
          className="rounded-xl px-3 py-2 text-center text-xs font-medium"
          style={{ color: "var(--color-primary)", background: "var(--color-primary-container)" }}
        >
          {copyMsg}
        </div>
      )}

      {decryptedSecrets.length === 0 ? (
        <div className="flex flex-col items-center space-y-2 py-16">
          <div className="text-4xl">🔐</div>
          <p className="text-on-surface text-sm">No secrets yet</p>
          <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
            Capture a password, credit card, or PIN and it'll appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {decryptedSecrets.map((e) => {
            const revealed = revealedIds.has(e.id);
            const meta = Object.entries(e.metadata || {}).filter(
              ([k]) => k !== "category" && k !== "status",
            );
            return (
              <div
                key={e.id}
                className="overflow-hidden rounded-2xl border"
                style={{
                  background: "var(--color-surface-container)",
                  borderColor: "var(--color-outline-variant)",
                }}
              >
                <div className="flex items-center justify-between p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {bulkMode && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(e.id)}
                        onChange={(ev) =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (ev.target.checked) next.add(e.id);
                            else next.delete(e.id);
                            return next;
                          })
                        }
                        style={{ minHeight: 44, minWidth: 44 }}
                      />
                    )}
                    <span className="text-base">{getTypeConfig(e.type).i}</span>
                    <span className="text-on-surface truncate text-sm font-medium">{e.title}</span>
                  </div>
                  {!bulkMode && (
                    <button
                      onClick={() => toggleReveal(e.id)}
                      className="shrink-0 rounded-xl border px-3 py-1 text-xs font-medium transition-colors hover:bg-white/5"
                      style={{
                        color: "var(--color-primary)",
                        borderColor: "var(--color-primary-container)",
                      }}
                    >
                      {revealed ? "Hide" : "Reveal"}
                    </button>
                  )}
                </div>

                {revealed ? (
                  <div className="space-y-3 px-3 pb-3">
                    <div
                      className="rounded-xl border p-3"
                      style={{
                        background: "var(--color-surface-dim)",
                        borderColor: "var(--color-outline-variant)",
                      }}
                    >
                      <p className="text-on-surface font-mono text-sm break-all">{e.content}</p>
                    </div>
                    {meta.length > 0 && (
                      <div className="space-y-1.5">
                        {meta.map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2 text-xs">
                            <span
                              className="shrink-0"
                              style={{ color: "var(--color-on-surface-variant)" }}
                            >
                              {k.replace(/_/g, " ")}:
                            </span>
                            <span className="text-on-surface truncate">{String(v)}</span>
                            <button
                              onClick={() => copyToClipboard(String(v), `${k} copied`)}
                              className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
                            >
                              📋
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div
                      className="flex items-center gap-2 border-t pt-1"
                      style={{ borderColor: "var(--color-outline-variant)" }}
                    >
                      <button
                        onClick={() => copyToClipboard(e.content || "", "Content copied")}
                        className="rounded-xl border px-3 py-1 text-xs transition-colors hover:bg-white/5"
                        style={{
                          color: "var(--color-on-surface-variant)",
                          borderColor: "var(--color-outline-variant)",
                        }}
                      >
                        📋 Copy content
                      </button>
                      <button
                        onClick={() => onSelect(e)}
                        className="rounded-xl border px-3 py-1 text-xs transition-colors hover:bg-white/5"
                        style={{
                          color: "var(--color-on-surface-variant)",
                          borderColor: "var(--color-outline-variant)",
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 pb-3">
                    <span className="text-on-surface-variant text-sm tracking-widest">
                      ••••••••••••
                    </span>
                    {(e.tags?.length ?? 0) > 0 &&
                      e.tags!.slice(0, 3).map((tag: string) => (
                        <span
                          key={tag}
                          className="rounded-full px-2 py-0.5 text-[10px]"
                          style={{
                            color: "var(--color-on-surface-variant)",
                            background: "var(--color-surface-container)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {bulkMode && selectedIds.size > 0 && (
        <div
          className="fixed right-4 bottom-20 left-4 z-50 flex items-center justify-between rounded-2xl p-3"
          style={{
            background: "var(--color-surface-container-low)",
            borderColor: "var(--color-outline-variant)",
            border: "1px solid",
          }}
        >
          <span className="text-on-surface text-sm">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <button
              onClick={bulkDelete}
              className="rounded-lg px-4 text-xs font-semibold"
              style={{
                background: "color-mix(in oklch, var(--color-error) 20%, transparent)",
                color: "var(--color-error)",
                minHeight: 44,
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {showAddSecret && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center px-3 py-6 sm:items-center"
          style={{ background: "var(--color-scrim)" }}
          onClick={() => !addBusy && setShowAddSecret(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-2xl border"
            style={{
              background: "var(--color-surface-container-low)",
              borderColor: "var(--color-outline-variant)",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div className="border-b p-4" style={{ borderColor: "var(--color-outline-variant)" }}>
              <div className="flex items-center justify-between">
                <h3 className="text-on-surface text-base font-bold">➕ Add Secret</h3>
                <button
                  onClick={() => !addBusy && setShowAddSecret(false)}
                  className="text-lg leading-none"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  ✕
                </button>
              </div>
              <p className="mt-1 text-[11px]" style={{ color: "var(--color-on-surface-variant)" }}>
                Encrypted on this device. AI never sees this entry.
              </p>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
              <div className="space-y-1">
                <label
                  className="text-[11px] font-medium tracking-wide uppercase"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  Title
                </label>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => {
                    setAddTitle(e.target.value);
                    setAddError("");
                  }}
                  placeholder="e.g. Gmail password"
                  className="text-on-surface placeholder:text-on-surface-variant w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm transition-colors outline-none"
                  style={{ borderColor: "var(--color-outline-variant)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
                />
              </div>

              <div className="space-y-1">
                <label
                  className="text-[11px] font-medium tracking-wide uppercase"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  Secret value
                </label>
                <textarea
                  value={addContent}
                  onChange={(e) => {
                    setAddContent(e.target.value);
                    setAddError("");
                  }}
                  rows={3}
                  placeholder="Password, key, card number, etc."
                  className="text-on-surface placeholder:text-on-surface-variant w-full resize-none rounded-xl border bg-transparent px-3 py-2.5 font-mono text-sm transition-colors outline-none"
                  style={{ borderColor: "var(--color-outline-variant)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
                />
              </div>

              <div className="space-y-1">
                <label
                  className="text-[11px] font-medium tracking-wide uppercase"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={addTags}
                  onChange={(e) => setAddTags(e.target.value)}
                  placeholder="work, banking, 2fa"
                  className="text-on-surface placeholder:text-on-surface-variant w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm transition-colors outline-none"
                  style={{ borderColor: "var(--color-outline-variant)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-outline-variant)")}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    className="text-[11px] font-medium tracking-wide uppercase"
                    style={{ color: "var(--color-on-surface-variant)" }}
                  >
                    Extra fields
                  </label>
                  <button
                    onClick={() => setAddMetaRows((p) => [...p, { key: "", value: "" }])}
                    className="text-[11px] font-medium"
                    style={{ color: "var(--color-primary)" }}
                  >
                    + Add field
                  </button>
                </div>
                {addMetaRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) =>
                        setAddMetaRows((p) =>
                          p.map((r, idx) => (idx === i ? { ...r, key: e.target.value } : r)),
                        )
                      }
                      placeholder="username"
                      className="text-on-surface placeholder:text-on-surface-variant min-w-0 flex-1 rounded-xl border bg-transparent px-2.5 py-2 text-xs outline-none"
                      style={{ borderColor: "var(--color-outline-variant)" }}
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) =>
                        setAddMetaRows((p) =>
                          p.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)),
                        )
                      }
                      placeholder="value"
                      className="text-on-surface placeholder:text-on-surface-variant min-w-0 flex-1 rounded-xl border bg-transparent px-2.5 py-2 text-xs outline-none"
                      style={{ borderColor: "var(--color-outline-variant)" }}
                    />
                    <button
                      onClick={() => setAddMetaRows((p) => p.filter((_, idx) => idx !== i))}
                      className="shrink-0 text-sm"
                      style={{ color: "var(--color-error)" }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {addError && (
                <p className="text-xs" style={{ color: "var(--color-error)" }}>
                  {addError}
                </p>
              )}
            </div>

            <div
              className="flex items-center gap-2 border-t p-3"
              style={{ borderColor: "var(--color-outline-variant)" }}
            >
              <button
                onClick={() => !addBusy && setShowAddSecret(false)}
                className="flex-1 rounded-xl border py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
                style={{
                  color: "var(--color-on-surface-variant)",
                  borderColor: "var(--color-outline-variant)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddSecret}
                disabled={addBusy || !addTitle.trim() || !addContent.trim()}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-on-primary)",
                }}
              >
                {addBusy ? "Encrypting..." : "🔒 Save secret"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
