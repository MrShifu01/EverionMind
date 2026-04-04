import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { useTheme } from "../ThemeContext";
import { authFetch } from "../lib/authFetch";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function detectTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

const DAYS_OF_WEEK = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const LEAD_OPTIONS = [90, 30, 7, 1];

const DEFAULT_PREFS = {
  daily_enabled: false, daily_time: "20:00", daily_timezone: detectTimezone(),
  nudge_enabled: false, nudge_day: "sunday", nudge_time: "10:00", nudge_timezone: detectTimezone(),
  expiry_enabled: false, expiry_lead_days: [90, 30, 7, 1],
};

export default function NotificationSettings() {
  const { t } = useTheme();
  const [permission, setPermission] = useState(
    "Notification" in window ? Notification.permission : "unsupported"
  );
  const [subscription, setSubscription] = useState(null);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const pushSupported = "serviceWorker" in navigator && "PushManager" in window;
  const iosNoStandalone = isIOS() && !("Notification" in window);

  useEffect(() => {
    authFetch("/api/notification-prefs")
      .then(r => r.ok ? r.json() : null)
      .then(data => setPrefs(data ? { ...DEFAULT_PREFS, ...data } : DEFAULT_PREFS))
      .catch(() => setPrefs(DEFAULT_PREFS))
      .finally(() => setLoading(false));

    if (pushSupported) {
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => setSubscription(sub))
        .catch(err => console.error('[NotificationSettings] Failed to get push subscription', err));
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
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
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
    } catch (err) {
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

  async function savePref(updates) {
    setPrefs(p => ({ ...p, ...updates }));
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

  function toggleLeadDay(day) {
    const current = prefs.expiry_lead_days || [];
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort((a, b) => b - a);
    savePref({ expiry_lead_days: next });
  }

  function flash(msg) {
    setStatusMsg(msg);
    // Keep error messages visible longer
    const isError = msg.includes("Failed") || msg.includes("not configured");
    setTimeout(() => setStatusMsg(null), isError ? 8000 : 3000);
  }

  const card = {
    background: t.surface, border: `1px solid ${t.border}`,
    borderRadius: 12, padding: "16px 20px", marginBottom: 12,
  };
  const label = { fontSize: 13, fontWeight: 700, color: t.text, margin: "0 0 2px" };
  const sub   = { fontSize: 11, color: t.textDim, margin: "0 0 12px" };
  const toggle = (on) => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
    cursor: "pointer", border: "none",
    background: on ? "#4ECDC420" : `${t.surface}`,
    color: on ? "#4ECDC4" : t.textDim,
    outline: on ? "1px solid #4ECDC440" : `1px solid ${t.border}`,
  });
  const input = {
    padding: "8px 10px", background: t.bg, border: `1px solid ${t.border}`,
    borderRadius: 8, color: t.textSoft, fontSize: 12, outline: "none",
  };

  if (loading) return <div style={{ padding: 24, color: t.textDim, fontSize: 13 }}>Loading…</div>;

  // iOS not in standalone → show home screen instructions
  if (iosNoStandalone) {
    return (
      <div style={card}>
        <p style={label}>📱 Notifications on iPhone</p>
        <p style={sub}>To receive notifications, OpenBrain must be on your Home Screen.</p>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: t.textMuted, lineHeight: 2 }}>
          <li>Tap the <strong>Share button</strong> (□↑) in Safari</li>
          <li>Tap <strong>"Add to Home Screen"</strong></li>
          <li>Open OpenBrain from your Home Screen</li>
          <li>Come back here to enable notifications</li>
        </ol>
      </div>
    );
  }

  // Push not supported at all
  if (!pushSupported) {
    return (
      <div style={card}>
        <p style={label}>Notifications</p>
        <p style={{ ...sub, margin: 0 }}>Push notifications are not supported in this browser.</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 700, color: t.text, margin: "0 0 4px" }}>Notifications</p>
      <p style={{ fontSize: 11, color: t.textDim, margin: "0 0 14px" }}>
        <span style={{ color: statusMsg && (statusMsg.includes("Failed") || statusMsg.includes("not configured")) ? "#FF6B35" : undefined }}>
          {saving ? "Saving…" : statusMsg || "Get reminders and daily prompts on any device."}
        </span>
      </p>

      {/* Master toggle / permission state */}
      {permission === "denied" ? (
        <div style={{ ...card, border: "1px solid #FF6B3540", background: "#FF6B3508" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#FF6B35" }}>
            Notifications blocked — enable them in your browser settings, then reload.
          </p>
        </div>
      ) : (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={label}>Push Notifications</p>
              <p style={{ ...sub, margin: 0 }}>
                {subscription ? "Active on this device" : "Not subscribed on this device"}
              </p>
            </div>
            {subscription ? (
              <button onClick={handleDisable} aria-pressed={true} style={{ ...toggle(false), color: "#FF6B35", outline: "1px solid #FF6B3540" }}>
                Disable
              </button>
            ) : (
              <button onClick={handleEnable} aria-pressed={false} style={toggle(true)}>
                Enable
              </button>
            )}
          </div>
        </div>
      )}

      {/* Only show pref controls when subscribed */}
      {subscription && permission === "granted" && (
        <>
          {/* Daily capture prompt */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: prefs.daily_enabled ? 12 : 0 }}>
              <div>
                <p style={label}>Daily Capture Prompt</p>
                <p style={{ ...sub, margin: 0 }}>A nightly nudge to capture what's worth remembering.</p>
              </div>
              <button onClick={() => savePref({ daily_enabled: !prefs.daily_enabled })} aria-pressed={prefs.daily_enabled} style={toggle(prefs.daily_enabled)}>
                {prefs.daily_enabled ? "On" : "Off"}
              </button>
            </div>
            {prefs.daily_enabled && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                <div>
                  <div style={{ fontSize: 10, color: t.textDim, marginBottom: 4 }}>TIME</div>
                  <input
                    type="time" value={prefs.daily_time} style={input}
                    onChange={e => savePref({ daily_time: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 10, color: t.textDim, marginBottom: 4 }}>TIMEZONE</div>
                  <input
                    type="text" value={prefs.daily_timezone} style={{ ...input, width: "100%", boxSizing: "border-box" }}
                    onChange={e => savePref({ daily_timezone: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Fill Brain nudge */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: prefs.nudge_enabled ? 12 : 0 }}>
              <div>
                <p style={label}>Fill Brain Nudge</p>
                <p style={{ ...sub, margin: 0 }}>Weekly reminder to answer questions in Fill Brain.</p>
              </div>
              <button onClick={() => savePref({ nudge_enabled: !prefs.nudge_enabled })} aria-pressed={prefs.nudge_enabled} style={toggle(prefs.nudge_enabled)}>
                {prefs.nudge_enabled ? "On" : "Off"}
              </button>
            </div>
            {prefs.nudge_enabled && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                <div>
                  <div style={{ fontSize: 10, color: t.textDim, marginBottom: 4 }}>DAY</div>
                  <select value={prefs.nudge_day} style={input} onChange={e => savePref({ nudge_day: e.target.value })}>
                    {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: t.textDim, marginBottom: 4 }}>TIME</div>
                  <input
                    type="time" value={prefs.nudge_time} style={input}
                    onChange={e => savePref({ nudge_time: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 10, color: t.textDim, marginBottom: 4 }}>TIMEZONE</div>
                  <input
                    type="text" value={prefs.nudge_timezone} style={{ ...input, width: "100%", boxSizing: "border-box" }}
                    onChange={e => savePref({ nudge_timezone: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Expiry reminders */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: prefs.expiry_enabled ? 12 : 0 }}>
              <div>
                <p style={label}>Expiry Reminders</p>
                <p style={{ ...sub, margin: 0 }}>Alerts before passport, licence, insurance expire.</p>
              </div>
              <button onClick={() => savePref({ expiry_enabled: !prefs.expiry_enabled })} aria-pressed={prefs.expiry_enabled} style={toggle(prefs.expiry_enabled)}>
                {prefs.expiry_enabled ? "On" : "Off"}
              </button>
            </div>
            {prefs.expiry_enabled && (
              <div>
                <div style={{ fontSize: 10, color: t.textDim, marginBottom: 8 }}>REMIND ME THIS MANY DAYS BEFORE</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {LEAD_OPTIONS.map(day => {
                    const active = (prefs.expiry_lead_days || []).includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => toggleLeadDay(day)}
                        aria-pressed={active}
                        style={{
                          padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                          cursor: "pointer", border: "none",
                          background: active ? "#4ECDC420" : t.bg,
                          color: active ? "#4ECDC4" : t.textDim,
                          outline: active ? "1px solid #4ECDC440" : `1px solid ${t.border}`,
                        }}
                      >
                        {day}d
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
