import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { clearAISettingsCache } from "../../lib/aiSettings";
import { authFetch } from "../../lib/authFetch";
import MemoryImportPanel from "../MemoryImportPanel";
import GoogleKeepImportPanel from "./GoogleKeepImportPanel";

interface Props {
  email: string;
  brainId?: string;
}

interface ProfileFields {
  display_name: string;
  phone: string;
  address: string;
  city: string;
  country: string;
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PROFILE_LABELS: Record<keyof ProfileFields, string> = {
  display_name: "Display name",
  phone: "Phone",
  address: "Address",
  city: "City",
  country: "Country",
};

export default function AccountTab({ email, brainId }: Props) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileFields>({
    display_name: "",
    phone: "",
    address: "",
    city: "",
    country: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const m = user.user_metadata || {};
      setProfile({
        display_name: m.display_name || "",
        phone: m.phone || "",
        address: m.address || "",
        city: m.city || "",
        country: m.country || "",
      });
    });
  }, []);

  async function saveProfile() {
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);
    const { error: err } = await supabase.auth.updateUser({ data: profile });
    setProfileSaving(false);
    if (err) setProfileError(err.message);
    else setProfileSaved(true);
  }

  const handleSignOut = async () => {
    setSigningOut(true);
    setError(null);
    clearAISettingsCache();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error.message);
      setSigningOut(false);
    }
  };

  async function fetchAllEntries() {
    const r = await authFetch("/api/entries");
    if (!r.ok) throw new Error("Failed to fetch entries");
    const data = await r.json();
    return Array.isArray(data) ? data : (data?.entries ?? []);
  }

  async function handleExportJSON() {
    setExporting(true);
    setExportError(null);
    try {
      const entries = await fetchAllEntries();
      const json = JSON.stringify(entries, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(json, `everion-export-${date}.json`, "application/json");
    } catch (e: any) {
      setExportError(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportCSV() {
    setExporting(true);
    setExportError(null);
    try {
      const entries = await fetchAllEntries();
      if (!entries.length) {
        setExportError("No entries to export.");
        return;
      }
      const cols = ["id", "title", "type", "content", "tags", "created_at", "updated_at"];
      const rows = [
        cols.join(","),
        ...entries.map((e: any) =>
          cols
            .map((c) => {
              const val = c === "tags" ? (e[c] || []).join("; ") : (e[c] ?? "");
              return `"${String(val).replace(/"/g, '""')}"`;
            })
            .join(","),
        ),
      ];
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(rows.join("\n"), `everion-export-${date}.csv`, "text/csv");
    } catch (e: any) {
      setExportError(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportVCard() {
    setExporting(true);
    setExportError(null);
    try {
      const entries = await fetchAllEntries();
      const contacts = entries.filter((e: any) =>
        ["person", "contact"].includes(e.type?.toLowerCase()),
      );
      if (!contacts.length) {
        setExportError("No person/contact entries to export.");
        setExporting(false);
        return;
      }
      const vcards = contacts.map((e: any) => {
        const meta = e.metadata || {};
        const lines = [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `FN:${e.title}`,
          meta.email ? `EMAIL:${meta.email}` : "",
          meta.phone ? `TEL:${meta.phone}` : "",
          e.content ? `NOTE:${e.content.replace(/\n/g, "\\n")}` : "",
          "END:VCARD",
        ].filter(Boolean);
        return lines.join("\r\n");
      });
      const date = new Date().toISOString().slice(0, 10);
      downloadFile(vcards.join("\r\n"), `everion-contacts-${date}.vcf`, "text/vcard");
    } catch (e: any) {
      setExportError(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Account info */}
      <div
        className="rounded-2xl border p-4"
        style={{
          background: "var(--color-surface-container-high)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-on-surface text-sm font-semibold">Account</p>
            <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
              {email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{
              color: "var(--color-error)",
              borderColor: "color-mix(in oklch, var(--color-error) 30%, transparent)",
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs" style={{ color: "var(--color-error)" }}>
            {error}
          </p>
        )}
      </div>

      {/* Profile — collapsible */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: "var(--color-surface-container-high)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        <button
          type="button"
          onClick={() => setProfileOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3.5 text-left"
        >
          <div className="min-w-0">
            <p className="text-on-surface text-sm font-semibold">Profile</p>
            {!profileOpen && profile.display_name && (
              <p className="text-xs truncate" style={{ color: "var(--color-on-surface-variant)" }}>
                {profile.display_name}{profile.city ? ` · ${profile.city}` : ""}
              </p>
            )}
            {!profileOpen && !profile.display_name && (
              <p className="text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
                Basic details stored with your account.
              </p>
            )}
          </div>
          <svg
            className={`ml-3 h-4 w-4 flex-shrink-0 transition-transform ${profileOpen ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {profileOpen && (
          <div className="px-4 pb-4">
            <div className="space-y-2">
              {(Object.keys(PROFILE_LABELS) as (keyof ProfileFields)[]).map((field) => (
                <div key={field}>
                  <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-on-surface-variant)" }}>
                    {PROFILE_LABELS[field]}
                  </label>
                  <input
                    type="text"
                    value={profile[field]}
                    onChange={(e) => setProfile((p) => ({ ...p, [field]: e.target.value }))}
                    className="text-on-surface w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{
                      background: "var(--color-surface-container-low)",
                      borderColor: "var(--color-outline-variant)",
                    }}
                  />
                </div>
              ))}
            </div>
            {profileError && (
              <p className="mt-2 text-xs" style={{ color: "var(--color-error)" }}>{profileError}</p>
            )}
            {profileSaved && (
              <p className="mt-2 text-xs" style={{ color: "var(--color-primary)" }}>Saved</p>
            )}
            <button
              onClick={saveProfile}
              disabled={profileSaving}
              className="press-scale mt-3 w-full rounded-xl py-2.5 text-xs font-semibold disabled:opacity-40"
              style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
            >
              {profileSaving ? "Saving…" : "Save profile"}
            </button>
          </div>
        )}
      </div>

      {/* Import AI Memories */}
      <div
        className="rounded-2xl border p-4"
        style={{
          background: "var(--color-surface-container-high)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        <p className="text-on-surface mb-1 text-sm font-semibold">Import from AI</p>
        <p className="mb-3 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          Bring in memories Claude or ChatGPT already knows about you.
        </p>
        <MemoryImportPanel brainId={brainId} />
      </div>

      {/* Google Keep Import */}
      {brainId && <GoogleKeepImportPanel brainId={brainId} />}

      {/* Data Export */}
      <div
        className="rounded-2xl border p-4"
        style={{
          background: "var(--color-surface-container-high)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        <p className="text-on-surface mb-1 text-sm font-semibold">Export Your Data</p>
        <p className="mb-3 text-xs" style={{ color: "var(--color-on-surface-variant)" }}>
          Download all your memories. Your data is always yours.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportJSON}
            disabled={exporting}
            className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
            style={{
              borderColor: "var(--color-outline-variant)",
              color: "var(--color-on-surface-variant)",
            }}
          >
            {exporting ? "Exporting…" : "JSON"}
          </button>
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
            style={{
              borderColor: "var(--color-outline-variant)",
              color: "var(--color-on-surface-variant)",
            }}
          >
            CSV
          </button>
          <button
            onClick={handleExportVCard}
            disabled={exporting}
            className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
            style={{
              borderColor: "var(--color-outline-variant)",
              color: "var(--color-on-surface-variant)",
            }}
          >
            vCard (contacts)
          </button>
        </div>
        {exportError && (
          <p className="mt-2 text-xs" style={{ color: "var(--color-error)" }}>
            {exportError}
          </p>
        )}
      </div>
    </div>
  );
}
