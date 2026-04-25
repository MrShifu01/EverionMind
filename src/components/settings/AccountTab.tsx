import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { clearAISettingsCache } from "../../lib/aiSettings";
import SettingsRow, { SettingsButton, SettingsExpand, SettingsText } from "./SettingsRow";
import { useSubscription } from "../../lib/useSubscription";

interface Props {
  email: string;
  isAdmin?: boolean;
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

export default function AccountTab({ email, isAdmin }: Props) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileFields>(
    () => readProfileCache() ?? { display_name: "", phone: "", address: "", city: "", country: "" },
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const { tier: billingTier } = useSubscription();
  const tierLabel = isAdmin ? "Admin" : billingTier === "max" ? "Max" : billingTier === "pro" ? "Pro" : billingTier === "starter" ? "Starter" : "Free";
  const tierColor = isAdmin ? "var(--ember)" : billingTier === "max" ? "var(--ember)" : billingTier === "pro" ? "var(--ember)" : billingTier === "starter" ? "var(--moss)" : "var(--ink-ghost)";

  const initials = (profile.display_name || email || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

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

  return (
    <div>
      {/* Profile card */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 0 20px", borderBottom: "1px solid var(--line-soft)", marginBottom: 4 }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--ember-wash)", border: "1px solid var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span className="f-serif" style={{ fontSize: 18, fontWeight: 500, color: "var(--ember)", letterSpacing: "-0.02em" }}>{initials}</span>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="f-serif" style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {profile.display_name || email}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span className="f-sans" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: tierColor, background: `${tierColor}18`, padding: "3px 8px", borderRadius: 5 }}>
              {tierLabel}
            </span>
          </div>
        </div>
      </div>

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
            {profileOpen ? "Done" : "Edit"}
          </SettingsButton>
        </div>
      </SettingsRow>

      <SettingsExpand open={profileOpen}>
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
        <div>
          <SettingsButton onClick={saveProfile} disabled={profileSaving}>
            {profileSaving ? "Saving…" : "Save profile"}
          </SettingsButton>
        </div>
      </SettingsExpand>

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
        <p className="f-sans" style={{ fontSize: 12, color: "var(--blood)", marginTop: 6 }}>
          {error}
        </p>
      )}
    </div>
  );
}
