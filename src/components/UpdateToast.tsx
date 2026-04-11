import { useState, useEffect } from "react";

// Polls the service worker registration for a waiting worker and shows a toast
// when one is available. Tapping "Update" sends SKIP_WAITING, which causes the
// new SW to activate and triggers controllerchange in main.tsx → page reload.
export default function UpdateToast() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (cancelled || !reg) return;

      const detect = () => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaiting(reg.waiting);
        }
      };

      detect();

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setWaiting(installing);
          }
        });
      });

      // Periodic check so long-lived sessions still notice deploys.
      const interval = window.setInterval(() => {
        reg.update().catch(() => {});
      }, 60_000);

      return () => window.clearInterval(interval);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting) return null;

  const applyUpdate = () => {
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <div
      role="alert"
      className="fixed bottom-24 left-1/2 z-[100] w-[90vw] max-w-sm -translate-x-1/2 overflow-hidden rounded-2xl border lg:bottom-6"
      style={{
        background: "var(--color-surface-container-high)",
        borderColor: "color-mix(in oklch, var(--color-primary) 25%, transparent)",
        boxShadow: "var(--shadow-lg)",
        animation: "slide-up 0.25s ease-out",
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-sm"
          style={{
            background: "color-mix(in oklch, var(--color-primary) 10%, transparent)",
          }}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            style={{ color: "var(--color-primary)" }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12a7.5 7.5 0 0013.386 4.664M19.5 12a7.5 7.5 0 00-13.386-4.664M19.5 4.5v4.5h-4.5M4.5 19.5v-4.5h4.5"
            />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-on-surface text-sm font-medium">Update available</p>
          <p className="text-on-surface-variant text-xs">Reload to get the latest version</p>
        </div>
        <button
          onClick={applyUpdate}
          className="text-primary hover:text-primary-dim press-scale text-xs font-bold tracking-widest uppercase transition-colors"
        >
          Update
        </button>
        <button
          onClick={() => setWaiting(null)}
          aria-label="Dismiss"
          className="text-on-surface-variant hover:text-on-surface ml-1 transition-colors"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
