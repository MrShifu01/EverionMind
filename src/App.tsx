import { useState, useEffect, lazy, Suspense, type JSX } from "react";
import { supabase, readCachedSession } from "./lib/supabase";
import { loadUserAISettings } from "./lib/aiSettings";
import { authFetch } from "./lib/authFetch";
import { identifyPostHogUser, resetPostHog } from "./lib/posthog";
import { trackSignupCompleted, trackDay7ReturnIfDue } from "./lib/events";
import { setCachedEmail, setCachedIsAdmin } from "./lib/userEmailCache";
import Landing from "./views/Landing";
import ErrorBoundary from "./ErrorBoundary";
import { MemoryProvider } from "./MemoryContext";
import { ThemeProvider } from "./ThemeContext";
import OfflineScreen from "./components/OfflineScreen";
import { Button } from "./components/ui/button";
import type { Session } from "@supabase/auth-js";

// Heavy code paths a first-paint visitor almost never hits — keep them out
// of the main bundle. Everion is the signed-in shell (most of the app).
// LoginScreen is ~1000 lines and only loads after the user clicks "Sign in".
// AdminView and ResetPasswordView are rare routes.
const Everion = lazy(() => import("./Everion"));
const LoginScreen = lazy(() => import("./LoginScreen"));
const AdminView = lazy(() => import("./views/AdminView"));
const ResetPasswordView = lazy(() => import("./views/ResetPasswordView"));
const StatusPage = lazy(() => import("./views/StatusPage"));

const PENDING_INVITE_KEY = "ob_pending_invite";

function getHashTokens(): {
  access_token: string;
  refresh_token: string;
  type: string | null;
} | null {
  const hash = window.location.hash.substring(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (access_token && refresh_token)
    return { access_token, refresh_token, type: params.get("type") };
  return null;
}

interface AppProps {
  /** Initial auth intent when App is mounted from main's Landing → CTA flow.
   *  "login" or "signup" — passed through to LoginScreen so the right form
   *  opens immediately when the chunk arrives. */
  initialAuthIntent?: "login" | "signup";
}

// Top-level route dispatcher. The /status route renders ahead of every
// other check so a user who can't sign in (Supabase auth down, expired
// keys, browser network issue) still sees the public status page.
// Pulling the dispatch out keeps the AppMain hook order stable and
// satisfies react-hooks/rules-of-hooks.
export default function App({ initialAuthIntent }: AppProps = {}): JSX.Element {
  if (typeof window !== "undefined" && window.location.pathname === "/status") {
    return (
      <ThemeProvider>
        <Suspense fallback={null}>
          <StatusPage />
        </Suspense>
      </ThemeProvider>
    );
  }
  return <AppMain initialAuthIntent={initialAuthIntent} />;
}

function AppMain({ initialAuthIntent }: AppProps = {}): JSX.Element {
  // Synchronously hydrate session from localStorage so we can render the
  // signed-in shell on the first paint instead of waiting for auth-js's
  // async getSession (which can do a network refresh near token expiry,
  // adding 4-6s to cold boot). The async useEffect below still runs and
  // upgrades to the canonical Session once auth-js confirms; if the cached
  // token has been revoked server-side, authFetch's 401 retry handles the
  // mismatch. `undefined` is reserved for "no cache + no answer yet" so the
  // loading screen still shows for genuinely first-time loads.
  const [session, setSession] = useState<Session | null | undefined>(() => {
    const cached = readCachedSession();
    return cached ? (cached as unknown as Session) : undefined;
  });
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  // Track connectivity so the app can show a calm offline gate when there's
  // no session and no internet (login can't proceed). Used on both native
  // and web standalone PWA — see OfflineScreen for context.
  const [bootOffline, setBootOffline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return false;
    return !navigator.onLine;
  });
  useEffect(() => {
    const sync = () => setBootOffline(!navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  const [earlyCapture, setEarlyCapture] = useState(false);
  const [earlyCaptureText, setEarlyCaptureText] = useState("");
  const [showLogin, setShowLogin] = useState(() => {
    // Skip landing and go straight to the login form when the URL already
    // signals authentication intent (invite token, magic-link hash, /login path)
    if (typeof window === "undefined") return false;
    if (window.location.pathname === "/login") return true;
    if (window.location.hash.includes("access_token")) return true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("invite")) return true;
    return false;
  });
  const [authIntent, setAuthIntent] = useState<"login" | "signup">(() => {
    if (initialAuthIntent) return initialAuthIntent;
    if (typeof window === "undefined") return "login";
    const params = new URLSearchParams(window.location.search);
    if (params.get("invite")) return "signup";
    return "login";
  });

  // Stash any ?invite=<token> from the URL before auth so it survives the
  // magic-link / email-confirm round-trip. LoginScreen reads the same key to
  // become invite-aware (banner + default to signup).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get("invite");
    if (tok && /^[0-9a-f]{64}$/i.test(tok)) {
      sessionStorage.setItem(PENDING_INVITE_KEY, tok);
    }
  }, []);

  // Once signed in, accept any pending invite (from URL or sessionStorage).
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("invite") || sessionStorage.getItem(PENDING_INVITE_KEY);
    if (!inviteToken) return;
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    window.history.replaceState(null, "", window.location.pathname);
    authFetch("/api/brains?action=accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inviteToken }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setInviteMsg("You've joined the brain! Refreshing…");
        else setInviteMsg(data.error || "Invite link invalid or already used.");
        setTimeout(() => {
          setInviteMsg(null);
          window.location.reload();
        }, 2500);
      })
      .catch(() => setInviteMsg("Failed to accept invite. Please try again."));
  }, [session]);

  // Mirror auth state into localStorage so render-time consumers (EntryList
  // admin chip gate, sidebar email) read sync. Authoritative gate is
  // server-side; cache is purely for UI hint visibility.
  useEffect(() => {
    if (session === undefined) return;
    const meta = session?.user?.app_metadata as { is_admin?: boolean } | undefined;
    setCachedEmail(session?.user?.email);
    setCachedIsAdmin(meta?.is_admin === true);
  }, [session]);

  useEffect(() => {
    const loadSettings = (userId: string) =>
      Promise.race([
        loadUserAISettings(userId),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]).catch((err) => console.error("[App] loadUserAISettings failed", err));

    const tokens = getHashTokens();
    if (tokens) {
      supabase.auth
        .setSession(tokens)
        .then(async ({ data: { session } }) => {
          if (session?.user?.id) await loadSettings(session.user.id);
          setSession(session);
          if (tokens.type === "recovery") setShowResetPassword(true);
          window.history.replaceState(null, "", window.location.pathname);
        })
        .catch(async () => {
          await supabase.auth
            .signOut()
            .catch((err) => console.error("[App] signOut after setSession failure", err));
          setSession(null);
          window.history.replaceState(null, "", window.location.pathname);
        });
      return;
    }

    // Time-bound getSession — auth-js reads from localStorage but can also
    // refresh near-expiry tokens, which hits the network. iOS PWA in airplane
    // mode stays stuck on LoadingScreen for ever if we wait for that. Race
    // with a 5s timeout: on win, the resolved value (session or null) is
    // used; on timeout, drop to null so the OfflineScreen / login gate
    // takes over instead of an indefinite spinner.
    let sessionResolved = false;
    Promise.race([
      supabase.auth.getSession().then((r) => ({ kind: "ok" as const, session: r.data.session })),
      new Promise<{ kind: "timeout" }>((resolve) =>
        setTimeout(() => resolve({ kind: "timeout" }), 5000),
      ),
    ])
      .then((result) => {
        if (sessionResolved) return;
        sessionResolved = true;
        if (result.kind === "timeout") {
          // Don't sign out — the stored token may still be valid; we just
          // couldn't confirm it in time. onAuthStateChange (subscribed below)
          // will still flip session to a real value once auth-js wakes up.
          console.warn("[App] getSession timed out — proceeding with null session");
          setSession(null);
          return;
        }
        const { session } = result;
        if (session?.user?.id) {
          void loadSettings(session.user.id);
          identifyPostHogUser(session.user.id, session.user.email ?? "");
        }
        setSession(session);
      })
      .catch(async () => {
        if (sessionResolved) return;
        sessionResolved = true;
        // Corrupted/malformed token in localStorage — clear it and send to login
        await supabase.auth
          .signOut()
          .catch((err) => console.error("[App] signOut after getSession failure", err));
        setSession(null);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      // Same fire-and-forget pattern as the initial getSession() above.
      // Auth state changes shouldn't block UI on settings round-trips.
      if (session?.user?.id) {
        void loadSettings(session.user.id);
        identifyPostHogUser(session.user.id, session.user.email ?? "");
        // Funnel events — both are localStorage-gated to fire once per device.
        // signup_completed gates on first SIGNED_IN per device; day_7_return
        // gates on user-age >= 7d. Both are no-ops if PostHog hasn't loaded
        // (consent not granted) or if they've fired before on this device.
        trackSignupCompleted({ email: session.user.email });
        if (session.user.created_at) {
          trackDay7ReturnIfDue({ signup_at: session.user.created_at });
        }
      } else {
        // Sign-out — drop the PostHog session so a shared device doesn't
        // merge two users' behaviour into one identified profile.
        resetPostHog();
      }
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined)
    return (
      <ThemeProvider>
        {earlyCapture ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: "var(--z-modal-backdrop)",
              background: "var(--color-background, #0e0e0e)",
              display: "flex",
              flexDirection: "column",
              padding: "24px 20px 40px",
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-faint, #888)",
                margin: "0 0 12px",
                fontFamily: "var(--f-sans)",
              }}
            >
              Capture — will open when app loads
            </p>
            <textarea
              autoFocus
              placeholder="What's on your mind?"
              value={earlyCaptureText}
              onChange={(e) => setEarlyCaptureText(e.target.value)}
              style={{
                flex: 1,
                background: "var(--surface-low, #161616)",
                border: "1px solid var(--line-soft, #333)",
                borderRadius: 12,
                color: "var(--ink, #f0ede6)",
                fontSize: 16,
                fontFamily: "var(--f-sans)",
                padding: "14px",
                resize: "none",
                outline: "none",
              }}
            />
            <Button
              onClick={() => {
                if (earlyCaptureText.trim()) {
                  localStorage.setItem("ob_pending_capture", earlyCaptureText.trim());
                }
                setEarlyCapture(false);
                setEarlyCaptureText("");
              }}
              style={{
                marginTop: 12,
                height: 48,
                borderRadius: 12,
                background: "var(--color-primary)",
                color: "var(--color-on-primary)",
                fontSize: 15,
                fontWeight: 600,
                fontFamily: "var(--f-sans)",
              }}
            >
              {earlyCaptureText.trim() ? "Save & continue" : "Cancel"}
            </Button>
          </div>
        ) : (
          <Button
            size="icon-lg"
            onClick={() => setEarlyCapture(true)}
            aria-label="New entry"
            className="press-scale fixed bottom-5 left-1/2 z-[60] h-14 w-14 -translate-x-1/2 rounded-full lg:hidden"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-on-primary)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </Button>
        )}
      </ThemeProvider>
    );
  if (!session && bootOffline)
    return (
      <ThemeProvider>
        <OfflineScreen onRetry={() => setBootOffline(!navigator.onLine)} />
      </ThemeProvider>
    );
  if (!session)
    return (
      <ThemeProvider>
        {showLogin ? (
          <Suspense fallback={null}>
            <LoginScreen initialIntent={authIntent} />
          </Suspense>
        ) : (
          <Landing
            onAuth={(mode) => {
              setAuthIntent(mode);
              setShowLogin(true);
            }}
          />
        )}
      </ThemeProvider>
    );
  if (showResetPassword)
    return (
      <ThemeProvider>
        <Suspense fallback={null}>
          <ResetPasswordView onDone={() => setShowResetPassword(false)} />
        </Suspense>
      </ThemeProvider>
    );

  const isAdminRoute = window.location.pathname === "/admin";
  const isAdmin =
    (session.user?.app_metadata as { is_admin?: boolean } | undefined)?.is_admin === true;

  // Admin preview hatch: ?preview=landing renders the marketing page even
  // for signed-in users so the developer can review it without logging out.
  // Sign-in / Sign-up clicks become a no-op + close-tab hint.
  const previewLanding = new URLSearchParams(window.location.search).get("preview") === "landing";
  if (previewLanding && isAdmin) {
    return (
      <ThemeProvider>
        <Landing
          onAuth={() => {
            window.close();
          }}
        />
      </ThemeProvider>
    );
  }

  if (isAdminRoute) {
    if (!isAdmin) {
      window.location.replace("/");
      return <></>;
    }
    return (
      <ThemeProvider>
        <Suspense fallback={null}>
          <AdminView />
        </Suspense>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <MemoryProvider>
          {inviteMsg && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                zIndex: "var(--z-native-overlay)",
                background: "var(--color-surface)",
                borderBottom: "1px solid var(--color-primary-container)",
                color: "var(--color-primary)",
                textAlign: "center",
                padding: "14px 16px",
                fontSize: "16px",
                fontFamily: "var(--f-sans)",
              }}
            >
              {inviteMsg}
            </div>
          )}
          <Suspense fallback={null}>
            <Everion initialShowCapture={earlyCapture} />
          </Suspense>
        </MemoryProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
