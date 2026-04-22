import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { clearAISettingsCache } from "../../lib/aiSettings";
import SettingsRow, { SettingsButton, SettingsText } from "./SettingsRow";

interface Props {
  email: string;
}

interface ProfileFields {
  display_name: string;
  phone: string;
  address: string;
  city: string;
  country: string;
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
  } catch { return null; }
}

function writeProfileCache(p: ProfileFields) {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export default function AccountTab({ email }: Props) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileFields>(
    () => readProfileCache() ?? { display_name: "", phone: "", address: "", city: "", country: "" },
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

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
    if (err) { setError(err.message); setSigningOut(false); }
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
            <p className="f-sans" style={{ fontSize: 12, color: "var(--blood)", margin: 0 }}>{profileError}</p>
          )}
          {profileSaved && (
            <p className="f-sans" style={{ fontSize: 12, color: "var(--moss)", margin: 0 }}>Saved.</p>
          )}
          <SettingsButton onClick={saveProfile} disabled={profileSaving}>
            {profileSaving ? "Saving…" : "Save profile"}
          </SettingsButton>
        </div>
      )}

      <SettingsRow label="Onboarding" hint="see the welcome flow again.">
        <SettingsButton
          onClick={() => {
            localStorage.removeItem("openbrain_onboarded");
            window.dispatchEvent(new CustomEvent("openbrain:restart-onboarding"));
          }}
        >
          Restart
        </SettingsButton>
      </SettingsRow>

      <SettingsRow label="Sign out" last>
        <SettingsButton onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </SettingsButton>
      </SettingsRow>
      {error && (
        <p className="f-sans" style={{ fontSize: 12, color: "var(--blood)", marginTop: 6 }}>{error}</p>
      )}
    </div>
  );
}
