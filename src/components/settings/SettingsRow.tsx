import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";

interface SettingsRowProps {
  label: string;
  hint?: ReactNode;
  children?: ReactNode;
  /** Last row in a group — hides the bottom divider */
  last?: boolean;
}

/**
 * Canonical Settings row — Linear/Notion-style. Sans-serif label on the left,
 * sans hint below, right-aligned control slot, hairline divider below.
 *
 * Visual decisions (2026-05-11):
 *   - Label: sans 14/500 — feels like a tool, not an essay.
 *   - Hint: sans 12.5/regular --ink-faint, line-height 1.5.
 *   - Padding: 14px top/bottom for density without crowding.
 *   - Divider: hairline `--line-soft`.
 *
 * Every settings tab uses this primitive — updating it cascades cohesion
 * across the whole Settings surface.
 */
export default function SettingsRow({ label, hint, children, last }: SettingsRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        padding: "14px 0",
        borderBottom: last ? "none" : "1px solid var(--line-soft)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="f-sans"
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--ink)",
            lineHeight: 1.35,
          }}
        >
          {label}
        </div>
        {hint && (
          <div
            className="f-sans"
            style={{
              fontSize: 12.5,
              color: "var(--ink-faint)",
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      {children && <div style={{ flexShrink: 0 }}>{children}</div>}
    </div>
  );
}

/**
 * Section heading — small-caps sans label sits at the top of each Settings
 * section, replacing the previous 32px serif H2. Single visual scale per
 * section keeps the surface from feeling essay-shaped.
 *
 * Use `topMargin` when a section follows another inside the same panel
 * (acts as the previous SubSection).
 */
export function SettingsSectionLabel({
  label,
  hint,
  topMargin,
  danger,
}: {
  label: string;
  hint?: ReactNode;
  topMargin?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        marginTop: topMargin ? 36 : 0,
        marginBottom: 6,
        paddingTop: topMargin ? 24 : 0,
        borderTop: topMargin ? "1px solid var(--line-soft)" : "none",
      }}
    >
      {/* Mono ALL-CAPS micro-caption matches the Inkwell idiom used in
          Hearth, Atelier, and Colloquy section headers. Wider tracking
          + JetBrains Mono reads as a chapter divider, not a control
          label. */}
      <div
        className="f-mono"
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: danger ? "var(--blood)" : "var(--ink-faint)",
          marginBottom: hint ? 6 : 0,
        }}
      >
        {label}
      </div>
      {hint && (
        <div
          className="f-serif"
          style={{
            fontSize: 13.5,
            color: "var(--ink-soft)",
            lineHeight: 1.55,
            fontStyle: "italic",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * Canonical inline-expand panel for SettingsRow disclosures. Sits directly below
 * a SettingsRow whose action toggles `open`. Renders the same padding + hairline
 * divider as a row so the visual rhythm continues unbroken.
 *
 * `keepMounted`: when true the children stay mounted while collapsed (hidden via
 * display:none). Use this when the inner panel does its own data fetch on mount
 * and you want it to fire as soon as the surrounding tab is visited — opening
 * "Manage" then feels instant. Default off because the cost of preloading
 * heavier panels (API tokens, OAuth state) isn't worth it if the user never
 * opens them.
 */
export function SettingsExpand({
  open,
  children,
  last,
  keepMounted,
}: {
  open: boolean;
  children: ReactNode;
  last?: boolean;
  keepMounted?: boolean;
}) {
  if (!open && !keepMounted) return null;
  return (
    <div
      style={{
        padding: "0 0 14px",
        borderBottom: last ? "none" : "1px solid var(--line-soft)",
        display: open ? "flex" : "none",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

/** Right-side informational text. Sans for cohesion with the new row style. */
export function SettingsValue({ children }: { children: ReactNode }) {
  return (
    <span
      className="f-sans"
      style={{
        fontSize: 13.5,
        color: "var(--ink-soft)",
      }}
    >
      {children}
    </span>
  );
}

/** Secondary sans value — used for right-side plain text like "hanno@everion.app". */
export function SettingsText({ children }: { children: ReactNode }) {
  return (
    <span className="f-sans" style={{ fontSize: 13.5, color: "var(--ink)" }}>
      {children}
    </span>
  );
}

/** Tight secondary button sized for Settings rows. Thin wrapper around the
 *  shared Button primitive so every SettingsRow control matches every
 *  other button in the app. */
export function SettingsButton({
  onClick,
  disabled,
  danger,
  children,
  type = "button",
}: {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
  type?: "button" | "submit";
}) {
  return (
    <Button
      type={type}
      size="sm"
      variant={danger ? "destructive" : "outline"}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

/** Lightweight toggle switch — wraps shadcn Switch so every settings
 *  toggle uses the same primitive. */
export function SettingsToggle({
  value,
  onChange,
  ariaLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
}) {
  return <Switch checked={value} onCheckedChange={onChange} aria-label={ariaLabel} />;
}
