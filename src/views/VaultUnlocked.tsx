// Unlocked vault — main view, secret cards, bulk-delete bar, and the
// inline add-secret modal. State + handlers live in useVaultOps; the
// view-mode toggle (grid / list) is local because it only matters here.
//
// Split out of VaultView.tsx. Accepts the full hook bag so the prop
// surface is one object, not 25 individual fields.

import { useEffect, useState } from "react";
import { getTypeConfig } from "../data/constants";
import type { useVaultOps } from "../hooks/useVaultOps";
import type { Entry } from "../types";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { getAdminFlags, isFeatureEnabled } from "../lib/featureFlags";
import { getTemplateOrFreeform, type TemplateId, type VaultTemplate } from "../lib/vaultTemplates";
import { VaultTemplatePicker } from "../components/vault/VaultTemplatePicker";
import { VaultTemplateForm } from "../components/vault/VaultTemplateForm";
import { buildVaultBackup, downloadVaultBackup } from "../lib/vaultBackup";
import { ConfirmDialog } from "../components/ConfirmDialog";
import MobileVaultUnlocked from "../components/vault/MobileVaultUnlocked";

type VaultOps = ReturnType<typeof useVaultOps>;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export function VaultUnlocked({
  ops,
  onSelect,
}: {
  ops: VaultOps;
  onSelect: (entry: Entry) => void;
}) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileVaultUnlocked ops={ops} onSelect={onSelect} />;
  return <VaultUnlockedDesktop ops={ops} onSelect={onSelect} />;
}

function VaultUnlockedDesktop({
  ops,
  onSelect,
}: {
  ops: VaultOps;
  onSelect: (entry: Entry) => void;
}) {
  const {
    decryptedSecrets,
    revealedIds,
    copyMsg,
    bulkMode,
    setBulkMode,
    selectedIds,
    setSelectedIds,
    showAddSecret,
    setShowAddSecret,
    addTitle,
    setAddTitle,
    addContent,
    setAddContent,
    addTags,
    setAddTags,
    addMetaRows,
    setAddMetaRows,
    addError,
    setAddError,
    addBusy,
    handleAddSecret,
    handleAddSecretWithTemplate,
    bulkDelete,
    toggleReveal,
    copyToClipboard,
    lockVault,
    startAddSecret,
  } = ops;

  const templatesEnabled = isFeatureEnabled("vaultTemplates", getAdminFlags());

  // Picker → form state for the templates flow. Reset whenever the modal
  // closes so reopening starts fresh on the picker step.
  const [pickedTemplate, setPickedTemplate] = useState<TemplateId | null>(null);
  const closeAddSecret = () => {
    if (addBusy) return;
    setShowAddSecret(false);
    setPickedTemplate(null);
  };

  // Wrap startAddSecret so reopening the modal always lands on the picker
  // step, even after a previous template was picked or saved.
  const openAddSecret = () => {
    setPickedTemplate(null);
    startAddSecret();
  };

  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const downloadBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    setBackupNotice(null);
    try {
      const backup = await buildVaultBackup();
      downloadVaultBackup(backup);
      setBackupNotice({
        kind: "ok",
        text: `Downloaded ${backup.entries.length} encrypted entries · open /decrypt.html to read offline.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Backup failed";
      setBackupNotice({ kind: "err", text: msg });
    }
    setBackupBusy(false);
    setTimeout(() => setBackupNotice(null), 6000);
  };

  return (
    <div
      className="space-y-4 px-4 py-4"
      style={{
        background: "var(--bg)",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: "18px 0 14px",
          borderBottom: "1px solid var(--line-soft)",
          marginBottom: 20,
        }}
      >
        {/* Row 1: title + subtitle. Stays in its own row so the action
          buttons below it can never overlap the subtitle on narrow screens. */}
        <div>
          <h1
            className="f-serif"
            style={{
              fontSize: 28,
              fontWeight: 450,
              letterSpacing: "-0.015em",
              lineHeight: 1.1,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            Vault
          </h1>
          <div
            className="f-serif"
            style={{ fontSize: 14, color: "var(--ink-faint)", fontStyle: "italic", marginTop: 4 }}
          >
            unlocked · {decryptedSecrets.length} secret
            {decryptedSecrets.length === 1 ? "" : "s"}
          </div>
        </div>

        {/* Row 2: action toolbar. Horizontally scrollable on narrow screens
          so the four buttons never wrap into a second line over the title. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            paddingBottom: 2,
          }}
        >
          <Button onClick={openAddSecret} size="sm" style={{ flexShrink: 0 }}>
            + Add secret
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBulkMode((b) => !b);
              setSelectedIds(new Set());
            }}
            style={{
              color: bulkMode ? "var(--ember)" : undefined,
              borderColor: bulkMode ? "var(--ember)" : undefined,
              flexShrink: 0,
            }}
          >
            {bulkMode ? "Cancel" : "Select"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadBackup}
            disabled={backupBusy}
            title="Download an encrypted backup you can decrypt offline at /decrypt.html"
            style={{ flexShrink: 0 }}
          >
            {backupBusy ? "Bundling…" : "↓ Backup"}
          </Button>
          <Button variant="outline" size="sm" onClick={lockVault} style={{ flexShrink: 0 }}>
            Lock
          </Button>
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

      {backupNotice && (
        <div
          className="rounded-xl px-3 py-2 text-center text-xs font-medium"
          style={
            backupNotice.kind === "ok"
              ? { color: "var(--moss)", background: "var(--surface)" }
              : { color: "var(--danger)", background: "var(--surface)" }
          }
        >
          {backupNotice.text}
        </div>
      )}

      {decryptedSecrets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--ember-wash)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              style={{ color: "var(--ember)" }}
              aria-hidden="true"
            >
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <h2
            className="f-serif"
            style={{
              fontSize: 24,
              fontWeight: 400,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
              margin: 0,
            }}
          >
            Vault is empty.
          </h2>
          <p
            className="f-serif"
            style={{
              fontSize: 15,
              fontStyle: "italic",
              color: "var(--ink-soft)",
              margin: 0,
              maxWidth: 360,
              lineHeight: 1.55,
            }}
          >
            Passwords, PINs, recovery codes, anything you don't want in plaintext. Encrypted
            client-side with your master passphrase.
          </p>
          <Button type="button" onClick={openAddSecret} className="mt-1">
            Add a secret
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {decryptedSecrets.map((e) => {
            const revealed = revealedIds.has(e.id);
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
                      <Checkbox
                        checked={selectedIds.has(e.id)}
                        onCheckedChange={(checked) =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(e.id);
                            else next.delete(e.id);
                            return next;
                          })
                        }
                        aria-label={`Select ${e.title}`}
                      />
                    )}
                    <span className="text-base">{getTypeConfig(e.type).i}</span>
                    <span className="text-on-surface truncate text-sm font-medium">{e.title}</span>
                  </div>
                  {!bulkMode && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => toggleReveal(e.id)}
                      style={{
                        color: "var(--color-primary)",
                        borderColor: "var(--color-primary-container)",
                      }}
                    >
                      {revealed ? "Hide" : "Reveal"}
                    </Button>
                  )}
                </div>

                {revealed ? (
                  <ShapedReveal
                    entry={e}
                    templatesEnabled={templatesEnabled}
                    onCopy={copyToClipboard}
                    onEdit={onSelect}
                  />
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
            <Button variant="destructive" size="sm" onClick={() => setConfirmBulkDelete(true)}>
              Delete
            </Button>
          </div>
        </div>
      )}

      {confirmBulkDelete && (
        <ConfirmDialog
          title="Delete selected secrets?"
          body={`Permanently delete ${selectedIds.size} selected secret${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmBulkDelete(false)}
          onConfirm={bulkDelete}
        />
      )}

      {showAddSecret && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: "var(--color-scrim)", padding: "12px 12px 0" }}
          onClick={closeAddSecret}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-t-2xl border sm:rounded-2xl"
            style={{
              background: "var(--color-surface-container-low)",
              borderColor: "var(--color-outline-variant)",
              fontFamily: "var(--f-sans)",
              display: "flex",
              flexDirection: "column",
              maxHeight: "calc(100dvh - 12px)",
            }}
          >
            <div
              className="border-b p-4"
              style={{ borderColor: "var(--color-outline-variant)", flexShrink: 0 }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-on-surface text-base font-bold">➕ Add Secret</h3>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={closeAddSecret}
                  aria-label="Close"
                  style={{ color: "var(--color-on-surface-variant)" }}
                >
                  ✕
                </Button>
              </div>
              <p className="mt-1 text-[11px]" style={{ color: "var(--color-on-surface-variant)" }}>
                Encrypted on this device. AI never sees this entry.
              </p>
            </div>

            <div
              className="space-y-3 p-4"
              style={
                {
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  overscrollBehavior: "contain",
                } as React.CSSProperties
              }
            >
              {templatesEnabled ? (
                pickedTemplate === null ? (
                  <VaultTemplatePicker onPick={setPickedTemplate} />
                ) : (
                  <VaultTemplateForm
                    templateId={pickedTemplate}
                    busy={addBusy}
                    error={addError}
                    onSubmit={(payload) => {
                      void handleAddSecretWithTemplate(payload);
                    }}
                    onBack={() => setPickedTemplate(null)}
                  />
                )
              ) : (
                <>
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
                      <Button
                        variant="link"
                        size="xs"
                        onClick={() => setAddMetaRows((p) => [...p, { key: "", value: "" }])}
                        className="px-0"
                      >
                        + Add field
                      </Button>
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
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setAddMetaRows((p) => p.filter((_, idx) => idx !== i))}
                          aria-label="Remove field"
                          style={{ color: "var(--color-error)" }}
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                  </div>

                  {addError && (
                    <p className="text-xs" style={{ color: "var(--color-error)" }}>
                      {addError}
                    </p>
                  )}
                </>
              )}
            </div>

            {!templatesEnabled && (
              <div
                className="flex items-center gap-2 border-t p-3"
                style={{
                  borderColor: "var(--color-outline-variant)",
                  flexShrink: 0,
                  paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
                }}
              >
                <Button variant="outline" size="lg" onClick={closeAddSecret} className="flex-1">
                  Cancel
                </Button>
                <Button
                  size="lg"
                  onClick={handleAddSecret}
                  disabled={addBusy || !addTitle.trim() || !addContent.trim()}
                  className="flex-1"
                >
                  {addBusy ? "Encrypting..." : "🔒 Save secret"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Reveal block — switches between shaped (template) and flat (legacy) render.
// Flag-off short-circuits to flat. Freeform template also renders flat (it
// has no structured fields). Anything else gets labelled rows from the
// template schema.
function ShapedReveal({
  entry,
  templatesEnabled,
  onCopy,
  onEdit,
}: {
  entry: Entry;
  templatesEnabled: boolean;
  onCopy: (text: string, label?: string) => void;
  onEdit: (entry: Entry) => void;
}) {
  const template: VaultTemplate | null = templatesEnabled
    ? getTemplateOrFreeform(entry.metadata as Record<string, unknown> | undefined)
    : null;
  const isShaped = template && template.id !== "freeform";

  return (
    <div className="space-y-3 px-3 pb-3">
      {isShaped ? (
        <ShapedRows entry={entry} template={template} onCopy={onCopy} />
      ) : (
        <div
          className="rounded-xl border p-3"
          style={{
            background: "var(--color-surface-dim)",
            borderColor: "var(--color-outline-variant)",
          }}
        >
          <p className="text-on-surface font-mono text-sm break-all">{entry.content}</p>
        </div>
      )}
      <div
        className="flex items-center gap-2 border-t pt-1"
        style={{ borderColor: "var(--color-outline-variant)" }}
      >
        <Button
          variant="outline"
          size="xs"
          onClick={() => onCopy(entry.content || "", "Content copied")}
        >
          📋 Copy {isShaped ? template!.primarySecretLabel.toLowerCase() : "content"}
        </Button>
        <Button variant="outline" size="xs" onClick={() => onEdit(entry)}>
          Edit
        </Button>
      </div>
    </div>
  );
}

function ShapedRows({
  entry,
  template,
  onCopy,
}: {
  entry: Entry;
  template: VaultTemplate;
  onCopy: (text: string, label?: string) => void;
}) {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const primary = entry.content ?? "";
  return (
    <div
      className="space-y-2 rounded-xl border p-3"
      style={{
        background: "var(--color-surface-dim)",
        borderColor: "var(--color-outline-variant)",
      }}
    >
      <ShapedRow
        label={template.primarySecretLabel}
        value={primary}
        masked={template.primarySecretMasked}
        copyable
        multiline={template.primarySecretMultiline}
        onCopy={onCopy}
      />
      {template.fields.map((field) => {
        const raw = meta[field.key];
        const value = typeof raw === "string" ? raw : "";
        if (!value) return null;
        return (
          <ShapedRow
            key={field.key}
            label={field.label}
            value={value}
            masked={field.masked}
            copyable={field.copyable}
            multiline={field.inputType === "textarea"}
            onCopy={onCopy}
          />
        );
      })}
    </div>
  );
}

function ShapedRow({
  label,
  value,
  masked,
  copyable,
  multiline,
  onCopy,
}: {
  label: string;
  value: string;
  masked: boolean;
  copyable: boolean;
  multiline: boolean;
  onCopy: (text: string, label?: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const display = !masked || revealed ? value : "•".repeat(Math.min(value.length, 12));
  return (
    <div
      className="flex items-start justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
      style={{ borderColor: "var(--color-outline-variant)" }}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div
          className="text-[10px] font-medium tracking-wide uppercase"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          {label}
        </div>
        <div
          className={`text-on-surface font-mono text-sm ${multiline ? "break-all whitespace-pre-wrap" : "break-all"}`}
        >
          {display || "—"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {masked && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="press rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
            style={{ color: "var(--color-primary)" }}
            aria-label={revealed ? "Hide" : "Reveal"}
          >
            {revealed ? "Hide" : "Show"}
          </button>
        )}
        {copyable && value && (
          <button
            type="button"
            onClick={() => onCopy(value, `${label} copied`)}
            className="press rounded-md px-2 py-0.5 text-[10px]"
            style={{ color: "var(--color-on-surface-variant)" }}
            aria-label={`Copy ${label}`}
          >
            📋
          </button>
        )}
      </div>
    </div>
  );
}
