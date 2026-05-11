import { StrictMode, lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LayoutGroup } from "framer-motion";
// Vercel telemetry — lazy-imported so it never lands in the first-paint
// bundle for declined-cookie users (saves ~15 KB gzipped on cold load).
const SpeedInsights = lazy(() =>
  import("@vercel/speed-insights/react").then((m) => ({ default: m.SpeedInsights })),
);
const Analytics = lazy(() =>
  import("@vercel/analytics/react").then((m) => ({ default: m.Analytics })),
);
import "./index.css";
// App is lazy-loaded so anonymous Landing visitors don't pay for the
// Supabase + auth + data-layer graph. The "boot App" decision happens below
// in chooseInitialBoot() — returning users (with a session token in
// localStorage) and any auth-implying URL bypass Landing entirely.
const App = lazy(() => import("./App"));
const Landing = lazy(() => import("./views/Landing"));
import { ThemeProvider } from "./ThemeContext";
import { DesignThemeProvider, applyInitialDesignTheme } from "./design/DesignThemeContext";
import ErrorBoundary from "./ErrorBoundary";
import PrivacyPolicy from "./views/PrivacyPolicy";
import TermsOfService from "./views/TermsOfService";
import NotFound from "./views/NotFound";
import { ConsentBanner, getConsentDecision } from "./components/ConsentBanner";
import UpdatePrompt from "./components/UpdatePrompt";
// Eager import — Suspense fallback for the lazy App / Landing chunks. Without
// this the gap between the inline boot shell (in index.html) and App's own
// LoadingScreen renders as a blank black screen, causing a visible flash.
// Tree-shaken into the eager chunk; subsequent lazy callers (App.tsx,
// Everion.tsx) reuse the same module via Vite's deduplication.
import LoadingScreen from "./components/LoadingScreen";
import LayoutDiagOverlay from "./components/LayoutDiagOverlay";
import { initPostHog } from "./lib/posthog";
import { initCapacitorBridge, hideSplashScreen, isNative } from "./lib/capacitorBridge";

// Paint the correct design family class on <html> before React mounts so the
// first frame uses the right theme tokens.
applyInitialDesignTheme();

// Load Google Fonts CSS via DOM injection rather than a render-blocking
// <link rel="stylesheet"> in index.html. The bytes are already in flight
// thanks to <link rel="preload" as="style"> in the HTML head, so this is
// effectively cache-warm. Why not the onload="this.media='all'" trick?
// CSP `script-src 'self'` blocks inline event handlers — captured by e2e
// when we tried it. JS injection is allowed, so do it from here.
(function loadFontsAsync() {
  // JetBrains Mono dropped from the cold-load font request — code blocks fall
  // back to system monospace (Menlo / Consolas / monospace) which is perfectly
  // legible. Saves ~70 KB and one round-trip on every visit. If we want
  // JetBrains Mono back for code blocks specifically, lazy-inject from the
  // CodeBlock component on mount.
  const href =
    "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=Inter+Tight:wght@400;450;500;600&display=swap";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
})();

async function initSentry() {
  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    enabled: !!import.meta.env.VITE_SENTRY_DSN,
    sendDefaultPii: false,
  });
}

// Defer 3rd-party SDK boot until after first paint + idle. Sentry +
// posthog-js together pull ~700 KB + 5 round-trips of static assets
// (recorder, surveys, dead-clicks, web-vitals, config). Running them
// eagerly competes with App / Landing / Supabase chunks for the same
// bandwidth and main-thread time on cold start. requestIdleCallback
// (with a 2s setTimeout fallback for Safari < 17) yields the boot path
// a clean window; errors thrown in the first ~2s are still caught by
// boot-watchdog.js, just not symbolicated by Sentry.
function deferSdks() {
  type Idle = (cb: () => void, opts?: { timeout?: number }) => number;
  const ric: Idle | undefined = (window as unknown as { requestIdleCallback?: Idle })
    .requestIdleCallback;
  const run = () => {
    void initSentry();
    void initPostHog();
  };
  if (ric) ric(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}
if (getConsentDecision() === "accepted") deferSdks();

// Don't auto-reload on `controllerchange`. vite-plugin-pwa already handles
// the reload internally — when the user taps "Refresh" in <UpdatePrompt>,
// it posts SKIP_WAITING to the new SW and reloads via its own `controlling`
// listener (node_modules/vite-plugin-pwa/.../register.js:52-55). The
// previous listener fired the same reload again whenever the SW took
// control through any path, which produced a visible flash 4-5s into a
// session whenever a new build had landed in the background. Letting the
// plugin own the reload means it only happens after the user opts in.

// iOS PWA resume bug — when a standalone-mode PWA is backgrounded for long
// enough, iOS Safari freezes the JS execution context but keeps the page
// snapshot in BFCache. On resume, `pageshow` fires with `persisted=true` and
// the user sees the boot shell from index.html (or a frozen React tree)
// while no JS is actually running. The user has to force-quit and reopen.
//
// Fix: track when the page was hidden, and on resume, if more than RESUME_THRESHOLD_MS
// elapsed, force a reload. Short app-switches stay snappy; long suspends recover.
// `pageshow.persisted` alone isn't enough because iOS sometimes fires it for
// short backgroundings — the timestamp gate keeps the reload behaviour
// proportionate.
if (!isNative()) {
  const HIDDEN_AT_KEY = "everion:hidden-at";
  const RESUME_THRESHOLD_MS = 10_000;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      try {
        sessionStorage.setItem(HIDDEN_AT_KEY, String(Date.now()));
      } catch {
        // sessionStorage can throw in private mode — survive without the timestamp.
      }
    }
  });
  window.addEventListener("pageshow", (e) => {
    const ev = e as PageTransitionEvent;
    if (!ev.persisted) return;
    let hiddenAt = 0;
    try {
      hiddenAt = Number(sessionStorage.getItem(HIDDEN_AT_KEY) ?? "0");
    } catch {
      /* private mode */
    }
    if (hiddenAt > 0 && Date.now() - hiddenAt > RESUME_THRESHOLD_MS) {
      window.location.reload();
    }
  });
}

// Capacitor wrap — register deep-link + native network listeners as early
// as possible so a cold-start magic-link callback isn't dropped.
void initCapacitorBridge();

// Catch dynamic-import failures that happen outside React (e.g. an early
// lazy() route chunk fails before any boundary mounts). Without this, the
// page just dies silently with "Importing a module script failed". We
// unregister the SW + clear caches once per session, then reload.
function looksLikeStaleBundle(reason: unknown): boolean {
  const msg = reason instanceof Error ? reason.message : String(reason ?? "");
  return (
    /Loading chunk \d+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}
async function recoverFromStaleBundle(): Promise<void> {
  try {
    const KEY = "everion:sw-recovered";
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, "1");
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    // fall through
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_sw", Date.now().toString(36));
  window.location.replace(url.toString());
}
window.addEventListener("unhandledrejection", (e) => {
  if (looksLikeStaleBundle(e.reason)) void recoverFromStaleBundle();
});
window.addEventListener("error", (e) => {
  if (looksLikeStaleBundle(e.error ?? e.message)) void recoverFromStaleBundle();
});

const pathname = window.location.pathname;

// Anonymous landing fast path. Returns true when the visitor lands on `/`
// with no auth signal anywhere — no session token in localStorage, no
// magic-link hash, no invite token. In that case we render <Landing /> by
// itself and let the user's first auth click lazy-load <App />.
//
// Cost on the win path: anonymous first-time visitor never imports Supabase
// (~30 KB gz), authFetch, MemoryProvider, loadUserAISettings, or Everion's
// upstream — Landing's chunk is the only thing parsed. Returning users (the
// other large segment) skip this branch via the storage probe below and
// boot App immediately, so their UX is unchanged.
function isAnonymousLandingCase(): boolean {
  if (pathname !== "/") return false;
  if (window.location.hash.includes("access_token")) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("invite")) return false;
  // Storage probe — same naming convention as src/lib/supabase.ts.
  // A session token's presence means this is a returning user; boot App.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) return false;
    }
  } catch {
    // localStorage unavailable (private mode, etc.) — fall through to Landing
  }
  return true;
}

function Root() {
  const [consent, setConsent] = useState(() => getConsentDecision());
  const [showApp, setShowApp] = useState(() => !isAnonymousLandingCase());
  const [authIntent, setAuthIntent] = useState<"login" | "signup">("login");

  // Hide the native splash screen once the first render has committed.
  // No-op on web; on iOS/Android this fades out the launch image.
  useEffect(() => {
    void hideSplashScreen();
  }, []);

  function handleDecision(decision: "accepted" | "declined") {
    if (decision === "accepted") {
      void initSentry();
      void initPostHog();
    }
    setConsent(decision);
  }

  if (pathname === "/privacy") return <PrivacyPolicy />;
  if (pathname === "/terms") return <TermsOfService />;

  // Known SPA paths fall through to <App />. Anything else is a 404.
  // (api/* and v1/* never reach the SPA; vercel.json strips them.)
  const KNOWN_PATHS = new Set(["/", "/login", "/admin"]);
  if (!KNOWN_PATHS.has(pathname)) return <NotFound />;

  // Anonymous landing — render Landing alone. App is mounted only after
  // the user clicks Sign in / Sign up, at which point the lazy chunk loads
  // and App takes over (it reads `?intent=` to know which mode to open).
  if (!showApp) {
    return (
      <>
        <Suspense fallback={<LoadingScreen />}>
          <Landing
            onAuth={(mode) => {
              setAuthIntent(mode);
              // Mirror what App expects: a /login pathname makes its
              // showLogin initialiser fire and bypasses Landing again.
              window.history.replaceState(null, "", "/login");
              setShowApp(true);
            }}
          />
        </Suspense>
        {consent === null && <ConsentBanner onDecision={handleDecision} />}
        <UpdatePrompt />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<LoadingScreen />}>
        <App initialAuthIntent={authIntent} />
      </Suspense>
      {consent === "accepted" && (
        <Suspense fallback={null}>
          <SpeedInsights />
          <Analytics />
        </Suspense>
      )}
      {consent === null && <ConsentBanner onDecision={handleDecision} />}
      <UpdatePrompt />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <DesignThemeProvider>
        <ThemeProvider>
          {/* LayoutGroup spans the entire boot tree so framer-motion can
              interpolate elements with the same layoutId across Suspense
              boundaries — e.g. the persistent orb that travels from the
              LoadingScreen position into MobileHome's bottom-anchored
              orb-button position on first paint. */}
          <LayoutGroup>
            <Root />
          </LayoutGroup>
          {/* TEMP diagnostic — gated by localStorage flag. Remove once
              the focus-shoots-above-screen bug is fixed and verified. */}
          <LayoutDiagOverlay />
        </ThemeProvider>
      </DesignThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
