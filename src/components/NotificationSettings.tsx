import { useState, useEffect, type JSX } from "react";
import { authFetch } from "../lib/authFetch";

const STATUS_FLASH_MS = 3000;
const ERROR_FLASH_MS = 8000;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const LEAD_OPTIONS = [90, 30, 7, 1];

interface NotificationPrefs {
  daily_enabled: boolean;
  daily_time: string;
  daily_timezone: string;
  nudge_enabled: boolean;
  nudge_day: string;
  nudge_time: string;
  nudge_timezone: string;
  expiry_enabled: boolean;
  expiry_lead_days: number[];
}

const DEFAULT_PREFS: NotificationPrefs = {
  daily_enabled: false,
  daily_time: "20:00",
  daily_timezone: detectTimezone(),
  nudge_enabled: false,
  nudge_day: "sunday",
  nudge_time: "10:00",
  nudge_timezone: detectTimezone(),
  expiry_enabled: false,
  expiry_lead_days: [90, 30, 7, 1],
};

import SettingsRow, { SettingsButton, SettingsToggle } from "./settings/SettingsRow";

const cardClasses = "design-card"; // legacy placeholder — unused now
const labelClasses = "text-[13px] font-bold text-on-surface m-0 mb-0.5";
const subClasses = "text-[11px] text-on-surface-variant m-0 mb-3";
const inputStyle: React.CSSProperties = {
  padding: "0 12px",
  height: 36,
  background: "var(--surface-low)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  color: "var(--ink)",
  fontFamily: "var(--f-sans)",
  fontSize: 13,
  outline: "none",
};

export default function NotificationSettings(): JSX.Element {
  const [permission, setPermission] = useState<string>(
    "Notification" in window ? Notification.permission : "unsupported",
  );
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const pushSupported = "serviceWorker" in navigator && "PushManager" in window;
  const iosNoStandalone = isIOS() && !("Notification" in window);

  useEffect(() => {
    authFetch("/api/notification-prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPrefs(data ? { ...DEFAULT_PREFS, ...data } : DEFAULT_PREFS))
      .catch(() => setPrefs(DEFAULT_PREFS))
      .finally(() => setLoading(false));

    if (pushSupported) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setSubscription(sub))
        .catch((err) =>
          console.error("[NotificationSettings] Failed to get push subscription", err),
        );
    }
  }, []);

  async function handleEnable() {
    if (!pushSupported) return;
    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        flash("VAPID key not configured — push notifications need server setup");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      setSubscription(sub);
      const json = sub.toJSON();
      const resp = await authFetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent.slice(0, 150),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        flash("Failed to save subscription — " + (err.error || "server error"));
        return;
      }
      flash("Notifications enabled");
    } catch (err: any) {
      console.error("[Push] subscribe error:", err);
      flash("Failed to enable — " + (err.message || "unknown error"));
    }
  }

  async function handleDisable() {
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    setSubscription(null);
    await authFetch("/api/push-subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    flash("Notifications disabled");
  }

  async function savePref(updates: Partial<NotificationPrefs>): Promise<void> {
    setPrefs((p) => ({ ...p, ...updates }));
    setSaving(true);
    try {
      await authFetch("/api/notification-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleLeadDay(day: number): void {
    const current = prefs.expiry_lead_days || [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => b - a);
    savePref({ expiry_lead_days: next });
  }

  function flash(msg: string): void {
    setStatusMsg(msg);
    const isError = msg.includes("Failed") || msg.includes("not configured");
    setTimeout(() => setStatusMsg(null), isError ? ERROR_FLASH_MS : STATUS_FLASH_MS);
  }

  const isStatusError =
    statusMsg && (statusMsg.includes("Failed") || statusMsg.includes("not configured"));

  if (loading) return <div className="text-on-surface-variant py-6 text-[13px]">Loading…</div>;

  // iOS not in standalone → show home screen instructions
  if (iosNoStandalone) {
    return (
      <div className={cardClasses}>
        <p className={labelClasses}>📱 Notifications on iPhone</p>
        <p className={subClasses}>
          To receive notifications, OpenBrain must be on your Home Screen.
        </p>
        <ol className="text-on-surface-variant/60 m-0 pl-5 text-xs leading-8">
          <li>
            Tap the <strong>Share button</strong> (□↑) in Safari
          </li>
          <li>
            Tap <strong>"Add to Home Screen"</strong>
          </li>
          <li>Open OpenBrain from your Home Screen</li>
          <li>Come back here to enable notifications</li>
        </ol>
      </div>
    );
  }

  // Push not supported at all
  if (!pushSupported) {
    return (
      <div className={cardClasses}>
        <p className={labelClasses}>Notifications</p>
        <p className="text-on-surface-variant m-0 text-[11px]">
          Push notifications are not supported in this browser.
        </p>
      </div>
    );
  }

  const subscribed = !!subscription && permission === "granted";

  return (
    <div>
      {/* Status / error flash */}
      {(saving || statusMsg) && (
        <p
          className="f-serif"
          style={{
            margin: "0 0 12px",
            fontSize: 13,
            fontStyle: "italic",
            color: isStatusError ? "var(--blood)" : "var(--ink-faint)",
          }}
        >
          {saving ? "saving…" : statusMsg}
        </p>
      )}

      {/* Master toggle / permission state */}
      {permission === "denied" ? (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: "var(--blood-wash)",
            border: "1px solid var(--blood)",
            marginBottom: 8,
          }}
        >
          <p
            className="f-serif"
            style={{ margin: 0, fontSize: 14, color: "var(--blood)", fontStyle: "italic" }}
          >
            notifications blocked. enable them in your browser settings, then reload.
          </p>
        </div>
      ) : (
        <SettingsRow
          label="Push notifications"
          hint={subscribed ? "active on this device." : "not subscribed on this device."}
        >
          {subscribed ? (
            <SettingsButton onClick={handleDisable} danger>
              Disable
            </SettingsButton>
          ) : (
            <SettingsButton onClick={handleEnable}>Enable</SettingsButton>
          )}
        </SettingsRow>
      )}

      {subscribed && (
        <>
          <SettingsRow
            label="Daily capture prompt"
            hint="a nightly nudge at 20:00 to capture what's worth remembering."
          >
            <SettingsToggle
              value={prefs.daily_enabled}
              onChange={(v) => savePref({ daily_enabled: v })}
              ariaLabel="Daily capture prompt"
            />
          </SettingsRow>

          <SettingsRow
            label="Quiet nudge"
            hint="when something in your memory rhymes with something new. weekly at most."
          >
            <SettingsToggle
              value={prefs.nudge_enabled}
              onChange={(v) => savePref({ nudge_enabled: v })}
              ariaLabel="Quiet nudge"
            />
          </SettingsRow>
          {prefs.nudge_enabled && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                padding: "4px 0 16px",
                borderBottom: "1px solid var(--line-soft)",
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="micro">day</span>
                <select
                  value={prefs.nudge_day}
                  style={inputStyle}
                  onChange={(e) => savePref({ nudge_day: e.target.value })}
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="micro">time</span>
                <input
                  type="time"
                  value={prefs.nudge_time}
                  style={inputStyle}
                  onChange={(e) => savePref({ nudge_time: e.target.value })}
                />
              </label>
              <label
                style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 160 }}
              >
                <span className="micro">timezone</span>
                <input
                  type="text"
                  value={prefs.nudge_timezone}
                  style={inputStyle}
                  onChange={(e) => savePref({ nudge_timezone: e.target.value })}
                />
              </label>
            </div>
          )}

          <SettingsRow
            label="Expiry reminders"
            hint="alerts before passport, licence, insurance expire."
            last={!prefs.expiry_enabled}
          >
            <SettingsToggle
              value={prefs.expiry_enabled}
              onChange={(v) => savePref({ expiry_enabled: v })}
              ariaLabel="Expiry reminders"
            />
          </SettingsRow>
          {prefs.expiry_enabled && (
            <div
              style={{
                padding: "4px 0 18px",
              }}
            >
              <div className="micro" style={{ marginBottom: 8 }}>
                remind me this many days before
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {LEAD_OPTIONS.map((day) => {
                  const active = (prefs.expiry_lead_days || []).includes(day);
                  return (
                    <button
                      key={day}
                      onClick={() => toggleLeadDay(day)}
                      aria-pressed={active}
                      className="press f-sans"
                      style={{
                        padding: "0 14px",
                        height: 30,
                        minHeight: 30,
                        borderRadius: 999,
                        background: active ? "var(--ember-wash)" : "var(--surface)",
                        color: active ? "var(--ember)" : "var(--ink-soft)",
                        border: `1px solid ${active ? "var(--ember)" : "var(--line-soft)"}`,
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      {day}d
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
