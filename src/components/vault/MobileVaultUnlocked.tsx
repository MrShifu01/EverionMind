import { useState } from "react";
import type { useVaultOps } from "../../hooks/useVaultOps";
import type { Entry } from "../../types";
import { getLockTimeoutMinutes } from "../../hooks/useVaultLockTimer";
import { getAdminFlags, isFeatureEnabled } from "../../lib/featureFlags";
import {
  getTemplateOrFreeform,
  type TemplateId,
  type VaultTemplate,
} from "../../lib/vaultTemplates";
import { VaultTemplatePicker } from "./VaultTemplatePicker";
import { VaultTemplateForm } from "./VaultTemplateForm";
import { buildVaultBackup, downloadVaultBackup } from "../../lib/vaultBackup";
import { ConfirmDialog } from "../ConfirmDialog";
import { VaultBrassDial } from "./VaultBrassDial";
import { Button } from "../ui/button";

type VaultOps = ReturnType<typeof useVaultOps>;

interface Props {
  ops: VaultOps;
  onSelect: (entry: Entry) => void;
}

function EyeIcon({ open }: { open: boolean }) {
  if (open)
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4 4 16 16M9.9 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.5 7.5A17 17 0 0 0 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1" />
    </svg>
  );
}

function ShapedRow({
  label,
  value,
  masked,
  copyable,
  onCopy,
}: {
  label: string;
  value: string;
  masked: boolean;
  copyable: boolean;
  onCopy: (text: string, label?: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const display = !masked || revealed ? value : "•".repeat(Math.min(value.length, 12));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          className="f-mono"
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 13,
            color: "var(--ink)",
            wordBreak: "break-all",
            marginTop: 2,
          }}
        >
          {display || "—"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {masked && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="press"
            style={{
              padding: "2px 6px",
              background: "transparent",
              border: "none",
              color: "var(--ember)",
              fontFamily: "var(--f-mono)",
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {revealed ? "Hide" : "Show"}
          </button>
        )}
        {copyable && value && (
          <button
            type="button"
            onClick={() => onCopy(value, `${label} copied`)}
            className="press"
            style={{
              padding: "2px 6px",
              background: "transparent",
              border: "none",
              color: "var(--ink-faint)",
              cursor: "pointer",
              fontSize: 11,
            }}
            aria-label={`Copy ${label}`}
          >
            📋
          </button>
        )}
      </div>
    </div>
  );
}

function ShapedReveal({
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
    <div style={{ marginTop: 8 }}>
      <ShapedRow
        label={template.primarySecretLabel}
        value={primary}
        masked={template.primarySecretMasked}
        copyable
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
            onCopy={onCopy}
          />
        );
      })}
    </div>
  );
}

export default function MobileVaultUnlocked({ ops, onSelect }: Props) {
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

  const [pickedTemplate, setPickedTemplate] = useState<TemplateId | null>(null);
  const closeAddSecret = () => {
    if (addBusy) return;
    setShowAddSecret(false);
    setPickedTemplate(null);
  };
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
        text: `Downloaded ${backup.entries.length} encrypted entries.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Backup failed";
      setBackupNotice({ kind: "err", text: msg });
    }
    setBackupBusy(false);
    setTimeout(() => setBackupNotice(null), 6000);
  };

  const lockMinutes = getLockTimeoutMinutes();

  return (
    <div
      className="bronze-screen"
      style={{
        padding: "8px 16px 22px",
        background: "var(--bg)",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ marginTop: 14, textAlign: "center" }}>
        <div
          className="f-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "var(--ember)",
            textTransform: "uppercase",
          }}
        >
          open · auto-locks in {lockMinutes}m
        </div>
        <div
          className="f-serif"
          style={{
            fontSize: 28,
            color: "var(--ink)",
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            marginTop: 4,
          }}
        >
          the <span style={{ fontStyle: "italic", color: "var(--ember)" }}>vault</span>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
        <VaultBrassDial unlocked onTap={lockVault} label="Lock vault" />
      </div>

      <div
        className="f-mono"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.2em",
          color: "var(--ink-faint)",
          textTransform: "uppercase",
          marginTop: 12,
          textAlign: "center",
        }}
      >
        tap a memory to peek
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          gap: 8,
          alignItems: "center",
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        <button
          type="button"
          onClick={openAddSecret}
          className="press"
          style={{
            flexShrink: 0,
            padding: "8px 14px",
            background: "var(--ember)",
            color: "var(--ember-ink)",
            border: "none",
            borderRadius: 999,
            fontFamily: "var(--f-sans)",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          + add secret
        </button>
        <button
          type="button"
          onClick={() => {
            setBulkMode((b) => !b);
            setSelectedIds(new Set());
          }}
          className="press"
          style={{
            flexShrink: 0,
            padding: "8px 12px",
            background: bulkMode ? "var(--ember-wash)" : "var(--surface-low)",
            border: `1px solid ${
              bulkMode ? "color-mix(in oklch, var(--ember) 40%, transparent)" : "var(--line-soft)"
            }`,
            borderRadius: 999,
            color: bulkMode ? "var(--ember)" : "var(--ink-soft)",
            fontFamily: "var(--f-mono)",
            fontSize: 9.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {bulkMode ? "cancel" : "select"}
        </button>
        <button
          type="button"
          onClick={downloadBackup}
          disabled={backupBusy}
          className="press"
          style={{
            flexShrink: 0,
            padding: "8px 12px",
            background: "var(--surface-low)",
            border: "1px solid var(--line-soft)",
            borderRadius: 999,
            color: "var(--ink-soft)",
            fontFamily: "var(--f-mono)",
            fontSize: 9.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight: 600,
            cursor: backupBusy ? "default" : "pointer",
            opacity: backupBusy ? 0.6 : 1,
          }}
        >
          {backupBusy ? "bundling…" : "↓ backup"}
        </button>
      </div>

      {copyMsg && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "var(--ember-wash)",
            border: "1px solid color-mix(in oklch, var(--ember) 30%, transparent)",
            borderRadius: 10,
            color: "var(--ember)",
            fontFamily: "var(--f-mono)",
            fontSize: 11,
            textAlign: "center",
          }}
        >
          {copyMsg}
        </div>
      )}

      {backupNotice && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: 10,
            color: backupNotice.kind === "ok" ? "var(--moss)" : "var(--blood)",
            fontFamily: "var(--f-sans)",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {backupNotice.text}
        </div>
      )}

      <div
        style={{
          flex: 1,
          marginTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {decryptedSecrets.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
            }}
          >
            <div
              className="f-serif"
              style={{
                fontSize: 18,
                fontStyle: "italic",
                color: "var(--ink-faint)",
                marginBottom: 8,
              }}
            >
              vault is empty.
            </div>
            <div
              className="f-serif"
              style={{ fontSize: 13, color: "var(--ink-faint)", lineHeight: 1.5 }}
            >
              passwords, PINs, recovery codes — anything you don't want in plaintext.
            </div>
          </div>
        ) : (
          decryptedSecrets.map((e) => {
            const peek = revealedIds.has(e.id);
            const template = templatesEnabled
              ? getTemplateOrFreeform(e.metadata as Record<string, unknown> | undefined)
              : null;
            const isShaped = !!template && template.id !== "freeform";
            return (
              <div
                key={e.id}
                style={{
                  position: "relative",
                  padding: "12px 14px",
                  background: "var(--surface)",
                  border: `1px solid ${
                    peek
                      ? "color-mix(in oklch, var(--ember) 32%, var(--line-soft))"
                      : "var(--line-soft)"
                  }`,
                  borderRadius: 14,
                  transition: "all 240ms ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    {bulkMode && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(e.id)}
                        onChange={(ev) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (ev.target.checked) next.add(e.id);
                            else next.delete(e.id);
                            return next;
                          });
                        }}
                        aria-label={`Select ${e.title}`}
                        style={{ flexShrink: 0 }}
                      />
                    )}
                    <span
                      className="f-serif"
                      style={{
                        fontSize: 14,
                        color: "var(--ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      {e.title}
                    </span>
                  </div>
                  {!bulkMode && (
                    <button
                      type="button"
                      onClick={() => toggleReveal(e.id)}
                      aria-label={peek ? "Hide" : "Reveal"}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: peek ? "var(--ember-wash)" : "var(--surface-low)",
                        border: `1px solid ${
                          peek
                            ? "color-mix(in oklch, var(--ember) 40%, transparent)"
                            : "var(--line-soft)"
                        }`,
                        color: peek ? "var(--ember)" : "var(--ink-faint)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      <EyeIcon open={peek} />
                    </button>
                  )}
                </div>

                {peek ? (
                  isShaped ? (
                    <ShapedReveal entry={e} template={template!} onCopy={copyToClipboard} />
                  ) : (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 10,
                        background: "var(--surface-low)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 10,
                        fontFamily: "var(--f-mono)",
                        fontSize: 13,
                        color: "var(--ink)",
                        wordBreak: "break-all",
                      }}
                    >
                      {e.content}
                    </div>
                  )
                ) : (
                  <>
                    <div
                      className="f-serif"
                      style={{
                        fontSize: 13.5,
                        color: "var(--ink-soft)",
                        lineHeight: 1.4,
                        letterSpacing: "-0.005em",
                        filter: "blur(5px)",
                        transition: "filter 320ms ease",
                        userSelect: "none",
                      }}
                    >
                      ••••••••••••••••••
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      {(e.tags ?? []).slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="f-mono"
                          style={{
                            fontSize: 8.5,
                            letterSpacing: "0.14em",
                            color: "var(--ink-faint)",
                            textTransform: "uppercase",
                            padding: "2px 6px",
                            background: "var(--surface-low)",
                            borderRadius: 4,
                            border: "1px solid var(--line-soft)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                      <span
                        className="f-mono"
                        style={{
                          fontSize: 8.5,
                          letterSpacing: "0.14em",
                          color: "var(--ink-faint)",
                          textTransform: "uppercase",
                        }}
                      >
                        sealed
                      </span>
                    </div>
                  </>
                )}

                {peek && (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: "1px solid var(--line-soft)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => copyToClipboard(e.content || "", "Content copied")}
                      className="press"
                      style={{
                        padding: "6px 10px",
                        background: "var(--surface-low)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 999,
                        color: "var(--ink-soft)",
                        fontFamily: "var(--f-mono)",
                        fontSize: 9.5,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      📋 copy
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelect(e)}
                      className="press"
                      style={{
                        padding: "6px 10px",
                        background: "var(--surface-low)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 999,
                        color: "var(--ink-soft)",
                        fontFamily: "var(--f-mono)",
                        fontSize: 9.5,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      edit
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {bulkMode && selectedIds.size > 0 && (
        <div
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: 90,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: "var(--surface-high)",
            border: "1px solid var(--line-soft)",
            borderRadius: 14,
            boxShadow: "var(--lift-3)",
          }}
        >
          <span
            className="f-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--ink-soft)",
            }}
          >
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={() => setConfirmBulkDelete(true)}
            className="press"
            style={{
              padding: "6px 12px",
              background: "var(--blood)",
              border: "none",
              borderRadius: 999,
              color: "white",
              fontFamily: "var(--f-sans)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
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
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "var(--scrim)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "12px 12px 0",
          }}
          onClick={closeAddSecret}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              background: "var(--surface)",
              border: "1px solid var(--line-soft)",
              borderRadius: "22px 22px 0 0",
              display: "flex",
              flexDirection: "column",
              maxHeight: "calc(100dvh - 12px)",
              boxShadow: "var(--lift-3)",
            }}
          >
            <div
              style={{
                padding: "14px 16px 12px",
                borderBottom: "1px solid var(--line-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <span
                  className="f-mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: "var(--ember)",
                    textTransform: "uppercase",
                  }}
                >
                  new secret
                </span>
                <div
                  className="f-mono"
                  style={{
                    fontSize: 9,
                    color: "var(--ink-faint)",
                    marginTop: 2,
                    letterSpacing: "0.1em",
                  }}
                >
                  encrypted on this device · AI never sees this entry
                </div>
              </div>
              <button
                type="button"
                onClick={closeAddSecret}
                className="press"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--ink-faint)",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: 4,
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                padding: "14px 16px",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
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
                  <div>
                    <label
                      className="f-mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--ink-faint)",
                        display: "block",
                        marginBottom: 6,
                      }}
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
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        background: "var(--surface-low)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 12,
                        padding: "10px 12px",
                        color: "var(--ink)",
                        fontFamily: "var(--f-sans)",
                        fontSize: 14,
                        outline: "none",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="f-mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--ink-faint)",
                        display: "block",
                        marginBottom: 6,
                      }}
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
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        background: "var(--surface-low)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 12,
                        padding: "10px 12px",
                        color: "var(--ink)",
                        fontFamily: "var(--f-mono)",
                        fontSize: 13,
                        outline: "none",
                        resize: "none",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="f-mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--ink-faint)",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Tags (comma separated)
                    </label>
                    <input
                      type="text"
                      value={addTags}
                      onChange={(e) => setAddTags(e.target.value)}
                      placeholder="work, banking, 2fa"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        background: "var(--surface-low)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 12,
                        padding: "10px 12px",
                        color: "var(--ink)",
                        fontFamily: "var(--f-sans)",
                        fontSize: 13,
                        outline: "none",
                      }}
                    />
                  </div>

                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <label
                        className="f-mono"
                        style={{
                          fontSize: 9,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          color: "var(--ink-faint)",
                        }}
                      >
                        Extra fields
                      </label>
                      <button
                        type="button"
                        onClick={() => setAddMetaRows((p) => [...p, { key: "", value: "" }])}
                        className="press"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--ember)",
                          fontFamily: "var(--f-mono)",
                          fontSize: 9,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          cursor: "pointer",
                          padding: "2px 4px",
                        }}
                      >
                        + add field
                      </button>
                    </div>
                    {addMetaRows.map((row, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <input
                          type="text"
                          value={row.key}
                          onChange={(e) =>
                            setAddMetaRows((p) =>
                              p.map((r, idx) => (idx === i ? { ...r, key: e.target.value } : r)),
                            )
                          }
                          placeholder="username"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            background: "var(--surface-low)",
                            border: "1px solid var(--line-soft)",
                            borderRadius: 10,
                            padding: "8px 10px",
                            color: "var(--ink)",
                            fontFamily: "var(--f-sans)",
                            fontSize: 12,
                            outline: "none",
                          }}
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
                          style={{
                            flex: 1,
                            minWidth: 0,
                            background: "var(--surface-low)",
                            border: "1px solid var(--line-soft)",
                            borderRadius: 10,
                            padding: "8px 10px",
                            color: "var(--ink)",
                            fontFamily: "var(--f-sans)",
                            fontSize: 12,
                            outline: "none",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setAddMetaRows((p) => p.filter((_, idx) => idx !== i))}
                          aria-label="Remove field"
                          className="press"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--blood)",
                            fontSize: 14,
                            cursor: "pointer",
                            padding: "0 6px",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  {addError && (
                    <p
                      className="f-serif"
                      style={{
                        fontSize: 13,
                        color: "var(--blood)",
                        fontStyle: "italic",
                        margin: 0,
                      }}
                    >
                      {addError}
                    </p>
                  )}
                </>
              )}
            </div>

            {!templatesEnabled && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  padding: "12px 16px",
                  borderTop: "1px solid var(--line-soft)",
                  paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
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
                  {addBusy ? "Encrypting..." : "🔒 Save"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
