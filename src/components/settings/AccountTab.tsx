import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { clearAISettingsCache } from "../../lib/aiSettings";
import { authFetch } from "../../lib/authFetch";
import MemoryImportPanel from "../MemoryImportPanel";
import GoogleKeepImportPanel from "./GoogleKeepImportPanel";
import SettingsRow, { SettingsButton, SettingsText, SettingsValue } from "./SettingsRow";

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

const PROFILE_CACHE_KEY = "everion_profile";

function readProfileCache(): ProfileFields | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeProfileCache(p: ProfileFields) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export default function AccountTab({ email, brainId }: Props) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileFields>(
    () => readProfileCache() ?? { display_name: "", phone: "", address: "", city: "", country: "" },
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [importsOpen, setImportsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const m = user.user_metadata || {};
      const fresh: ProfileFields = {
        display_name: m.display_name || "",
        phone: m.phone || "",
        address: m.address || "",
        city: m.city || "",
        country: m.country || "",
      };
      setProfile(fresh);
      writeProfileCache(fresh);
    });
  }, []);

  async function saveProfile() {
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);
    writeProfileCache(profile);
    const { error: err } = await supabase.auth.updateUser({ data: profile });
    setProfileSaving(false);
    if (err) setProfileError(err.message);
    else setProfileSaved(true);
  }

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    clearAISettingsCache();
    const { error: err } = await supabase.auth.signOut();
    if (err) {
      setError(err.message);
      setSigningOut(false);
    }
  }

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
    <div>
      <SettingsRow label="Email" hint="we only email you when a magic link is requested.">
        <SettingsText>{email || "—"}</SettingsText>
      </SettingsRow>

      <SettingsRow
        label="Display name"
        hint={profileOpen ? "edit your public details below." : undefined}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {profile.display_name && !profileOpen && (
            <SettingsText>{profile.display_name}</SettingsText>
          )}
          <SettingsButton onClick={() => setProfileOpen((v) => !v)}>
            {profileOpen ? "Close" : "Edit"}
          </SettingsButton>
        </div>
      </SettingsRow>

      {profileOpen && (
        <div
          style={{
            padding: "0 0 18px",
            borderBottom: "1px solid var(--line-soft)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {(Object.keys(PROFILE_LABELS) as (keyof ProfileFields)[]).map((field) => (
            <label key={field} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="micro">{PROFILE_LABELS[field]}</span>
              <input
                className="design-input f-sans"
                value={profile[field]}
                onChange={(e) => setProfile((p) => ({ ...p, [field]: e.target.value }))}
              />
            </label>
          ))}
          {profileError && (
            <p className="f-sans" style={{ fontSize: 12, color: "var(--blood)", margin: 0 }}>
              {profileError}
            </p>
          )}
          {profileSaved && (
            <p className="f-sans" style={{ fontSize: 12, color: "var(--moss)", margin: 0 }}>
              Saved.
            </p>
          )}
          <SettingsButton onClick={saveProfile} disabled={profileSaving}>
            {profileSaving ? "Saving…" : "Save profile"}
          </SettingsButton>
        </div>
      )}

      <SettingsRow label="Imports" hint="bring in memories Claude or ChatGPT already know about you.">
        <SettingsButton onClick={() => setImportsOpen((v) => !v)}>
          {importsOpen ? "Close" : "Manage"}
        </SettingsButton>
      </SettingsRow>
      {importsOpen && (
        <div
          style={{
            padding: "0 0 18px",
            borderBottom: "1px solid var(--line-soft)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <MemoryImportPanel brainId={brainId} />
          {brainId && <GoogleKeepImportPanel brainId={brainId} />}
        </div>
      )}

      <SettingsRow label="Export" hint="your data is yours — take it anywhere, any time.">
        <SettingsButton onClick={() => setExportOpen((v) => !v)}>
          {exportOpen ? "Close" : "Export"}
        </SettingsButton>
      </SettingsRow>
      {exportOpen && (
        <div
          style={{
            padding: "0 0 18px",
            borderBottom: "1px solid var(--line-soft)",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <SettingsButton onClick={handleExportJSON} disabled={exporting}>
            {exporting ? "Exporting…" : "JSON"}
          </SettingsButton>
          <SettingsButton onClick={handleExportCSV} disabled={exporting}>
            CSV
          </SettingsButton>
          <SettingsButton onClick={handleExportVCard} disabled={exporting}>
            vCard (contacts)
          </SettingsButton>
          {exportError && (
            <p className="f-sans" style={{ fontSize: 12, color: "var(--blood)", margin: 0, width: "100%" }}>
              {exportError}
            </p>
          )}
        </div>
      )}

      <SettingsRow label="Sign out" last>
        <SettingsButton onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </SettingsButton>
      </SettingsRow>
      {error && (
        <p className="f-sans" style={{ fontSize: 12, color: "var(--blood)", marginTop: 6 }}>
          {error}
        </p>
      )}

      {/* Silence unused variable lint — kept for potential future readers */}
      <span style={{ display: "none" }}>{SettingsValue.name}</span>
    </div>
  );
}
