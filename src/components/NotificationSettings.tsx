import { useState, useEffect, type JSX } from "react";
import { authFetch } from "../lib/authFetch";

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

const cardClasses = "bg-ob-surface border border-ob-border rounded-xl px-5 py-4 mb-3";
const labelClasses = "text-[13px] font-bold text-ob-text m-0 mb-0.5";
const subClasses = "text-[11px] text-ob-text-dim m-0 mb-3";
const inputClasses =
  "py-2 px-2.5 bg-ob-bg border border-ob-border rounded-lg text-ob-text-soft text-xs outline-none";

function toggleClasses(on: boolean): string {
  return `inline-flex items-center gap-1.5 py-[7px] px-3.5 rounded-[20px] text-xs font-bold cursor-pointer border-none ${
    on
      ? "bg-teal/[0.12] text-teal outline outline-1 outline-teal/25"
      : "bg-ob-surface text-ob-text-dim outline outline-1 outline-ob-border"
  }`;
}

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
    setTimeout(() => setStatusMsg(null), isError ? 8000 : 3000);
  }

  const isStatusError =
    statusMsg && (statusMsg.includes("Failed") || statusMsg.includes("not configured"));

  if (loading) return <div className="text-ob-text-dim p-6 text-[13px]">Loading…</div>;

  // iOS not in standalone → show home screen instructions
  if (iosNoStandalone) {
    return (
      <div className={cardClasses}>
        <p className={labelClasses}>📱 Notifications on iPhone</p>
        <p className={subClasses}>
          To receive notifications, OpenBrain must be on your Home Screen.
        </p>
        <ol className="text-ob-text-muted m-0 pl-5 text-xs leading-8">
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
        <p className="text-ob-text-dim m-0 text-[11px]">
          Push notifications are not supported in this browser.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-ob-text m-0 mb-1 text-sm font-bold">Notifications</p>
      <p className="text-ob-text-dim m-0 mb-3.5 text-[11px]">
        <span className={isStatusError ? "text-orange" : ""}>
          {saving ? "Saving…" : statusMsg || "Get reminders and daily prompts on any device."}
        </span>
      </p>

      {/* Master toggle / permission state */}
      {permission === "denied" ? (
        <div className={`${cardClasses} border-orange/25 bg-orange/[0.03]`}>
          <p className="text-orange m-0 text-xs">
            Notifications blocked — enable them in your browser settings, then reload.
          </p>
        </div>
      ) : (
        <div className={`${cardClasses} mb-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={labelClasses}>Push Notifications</p>
              <p className="text-ob-text-dim m-0 text-[11px]">
                {subscription ? "Active on this device" : "Not subscribed on this device"}
              </p>
            </div>
            {subscription ? (
              <button
                onClick={handleDisable}
                aria-pressed={true}
                className={`${toggleClasses(false)} !text-orange !outline-orange/25`}
              >
                Disable
              </button>
            ) : (
              <button onClick={handleEnable} aria-pressed={false} className={toggleClasses(true)}>
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
          <div className={cardClasses}>
            <div
              className={`flex items-center justify-between ${prefs.daily_enabled ? "mb-3" : ""}`}
            >
              <div>
                <p className={labelClasses}>Daily Capture Prompt</p>
                <p className="text-ob-text-dim m-0 text-[11px]">
                  A nightly nudge to capture what's worth remembering.
                </p>
              </div>
              <button
                onClick={() => savePref({ daily_enabled: !prefs.daily_enabled })}
                aria-pressed={prefs.daily_enabled}
                className={toggleClasses(prefs.daily_enabled)}
              >
                {prefs.daily_enabled ? "On" : "Off"}
              </button>
            </div>
            {prefs.daily_enabled && (
              <div className="mt-1 flex flex-wrap gap-2">
                <div>
                  <div className="text-ob-text-dim mb-1 text-[10px]">TIME</div>
                  <input
                    type="time"
                    value={prefs.daily_time}
                    className={inputClasses}
                    onChange={(e) => savePref({ daily_time: e.target.value })}
                  />
                </div>
                <div className="min-w-40 flex-1">
                  <div className="text-ob-text-dim mb-1 text-[10px]">TIMEZONE</div>
                  <input
                    type="text"
                    value={prefs.daily_timezone}
                    className={`${inputClasses} box-border w-full`}
                    onChange={(e) => savePref({ daily_timezone: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Fill Brain nudge */}
          <div className={cardClasses}>
            <div
              className={`flex items-center justify-between ${prefs.nudge_enabled ? "mb-3" : ""}`}
            >
              <div>
                <p className={labelClasses}>Fill Brain Nudge</p>
                <p className="text-ob-text-dim m-0 text-[11px]">
                  Weekly reminder to answer questions in Fill Brain.
                </p>
              </div>
              <button
                onClick={() => savePref({ nudge_enabled: !prefs.nudge_enabled })}
                aria-pressed={prefs.nudge_enabled}
                className={toggleClasses(prefs.nudge_enabled)}
              >
                {prefs.nudge_enabled ? "On" : "Off"}
              </button>
            </div>
            {prefs.nudge_enabled && (
              <div className="mt-1 flex flex-wrap gap-2">
                <div>
                  <div className="text-ob-text-dim mb-1 text-[10px]">DAY</div>
                  <select
                    value={prefs.nudge_day}
                    className={inputClasses}
                    onChange={(e) => savePref({ nudge_day: e.target.value })}
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d} value={d}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-ob-text-dim mb-1 text-[10px]">TIME</div>
                  <input
                    type="time"
                    value={prefs.nudge_time}
                    className={inputClasses}
                    onChange={(e) => savePref({ nudge_time: e.target.value })}
                  />
                </div>
                <div className="min-w-40 flex-1">
                  <div className="text-ob-text-dim mb-1 text-[10px]">TIMEZONE</div>
                  <input
                    type="text"
                    value={prefs.nudge_timezone}
                    className={`${inputClasses} box-border w-full`}
                    onChange={(e) => savePref({ nudge_timezone: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Expiry reminders */}
          <div className={cardClasses}>
            <div
              className={`flex items-center justify-between ${prefs.expiry_enabled ? "mb-3" : ""}`}
            >
              <div>
                <p className={labelClasses}>Expiry Reminders</p>
                <p className="text-ob-text-dim m-0 text-[11px]">
                  Alerts before passport, licence, insurance expire.
                </p>
              </div>
              <button
                onClick={() => savePref({ expiry_enabled: !prefs.expiry_enabled })}
                aria-pressed={prefs.expiry_enabled}
                className={toggleClasses(prefs.expiry_enabled)}
              >
                {prefs.expiry_enabled ? "On" : "Off"}
              </button>
            </div>
            {prefs.expiry_enabled && (
              <div>
                <div className="text-ob-text-dim mb-2 text-[10px]">
                  REMIND ME THIS MANY DAYS BEFORE
                </div>
                <div className="flex flex-wrap gap-2">
                  {LEAD_OPTIONS.map((day) => {
                    const active = (prefs.expiry_lead_days || []).includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => toggleLeadDay(day)}
                        aria-pressed={active}
                        className={`cursor-pointer rounded-[20px] border-none px-3.5 py-1.5 text-xs font-bold ${
                          active
                            ? "bg-teal/[0.12] text-teal outline-teal/25 outline outline-1"
                            : "bg-ob-bg text-ob-text-dim outline-ob-border outline outline-1"
                        }`}
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
