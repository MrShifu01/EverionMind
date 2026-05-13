// Capacitor native-shell bridge.
//
// Safe to call from web — Capacitor.isNativePlatform() returns false outside
// the iOS/Android wrap, and every helper guards on it. The web build never
// touches the native plugins beyond a no-op import.
//
// Wires three things the wrap needs that the PWA gets for free:
//   1. Deep-link auth callback — Supabase magic-link `everion://auth/callback`
//      arrives as an `appUrlOpen` event; we hand the URL to Supabase so the
//      session token in the fragment is consumed and stored.
//   2. Native online/offline status — replaces the unreliable `navigator.onLine`
//      heuristic on iOS/Android WebViews.
//   3. Splash-screen hide on first paint — config sets launchAutoHide=false so
//      the splash stays until React is mounted.

import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp, type URLOpenListenerEvent } from "@capacitor/app";
import { Network, type ConnectionStatus } from "@capacitor/network";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { supabase } from "./supabase";

/** True when running inside the Capacitor wrap (iOS / Android), false on web. */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Platform string — "ios" | "android" | "web". */
export function nativePlatform(): "ios" | "android" | "web" {
  try {
    const p = Capacitor.getPlatform();
    if (p === "ios" || p === "android") return p;
    return "web";
  } catch {
    return "web";
  }
}

// ── Deep-link auth ──────────────────────────────────────────────────────────
//
// Supabase magic links open with a fragment `#access_token=...&refresh_token=...`.
// On web Supabase auto-parses `window.location.hash`. Inside the wrap the URL
// arrives via Capacitor's `appUrlOpen` event instead — we strip the scheme,
// reconstruct a URL Supabase understands, and call `setSession()` directly.

async function handleAuthDeepLink(rawUrl: string): Promise<void> {
  try {
    const url = new URL(rawUrl);
    // Tokens may live in either the fragment or the query string; check both.
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    const params = new URLSearchParams(hash || url.search);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");

    if (access_token && refresh_token) {
      await supabase.auth.setSession({ access_token, refresh_token });
      return;
    }

    // PKCE / code-exchange flow — Supabase v2 supports this on the auth client.
    const code = params.get("code");
    if (code) {
      // exchangeCodeForSession is the v2 API; fall back gracefully if absent.
      const exchange = (
        supabase.auth as unknown as {
          exchangeCodeForSession?: (c: string) => Promise<unknown>;
        }
      ).exchangeCodeForSession;
      if (typeof exchange === "function") {
        await exchange.call(supabase.auth, code);
      }
    }
  } catch (e) {
    // Don't crash the wrap on a malformed URL — auth screen will show normally.
    if (typeof console !== "undefined") console.warn("[capacitor] deep-link parse failed", e);
  }
}

let deepLinkUnsub: (() => void) | null = null;

async function registerDeepLinkHandler(): Promise<void> {
  if (deepLinkUnsub) return;
  const handle = await CapacitorApp.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
    if (!event?.url) return;
    if (/\bauth\b/.test(event.url) || /access_token=|code=/.test(event.url)) {
      void handleAuthDeepLink(event.url);
    }
  });
  deepLinkUnsub = () => {
    void handle.remove();
  };
}

// ── Network status ─────────────────────────────────────────────────────────

let networkUnsub: (() => void) | null = null;
let cachedNetwork: ConnectionStatus | null = null;

async function registerNetworkHandler(onChange: (status: ConnectionStatus) => void): Promise<void> {
  if (networkUnsub) return;
  cachedNetwork = await Network.getStatus();
  onChange(cachedNetwork);
  const handle = await Network.addListener("networkStatusChange", (status) => {
    cachedNetwork = status;
    onChange(status);
  });
  networkUnsub = () => {
    void handle.remove();
  };
}

/** Last known native connection status, or null on web / before init. */
export function getNativeNetworkStatus(): ConnectionStatus | null {
  return cachedNetwork;
}

// ── Keyboard ───────────────────────────────────────────────────────────────
//
// iOS Safari renders a form accessory bar (Previous / Next / Done) above the
// keyboard for any focused input. There is NO web API to hide it — it's a
// system UI element. In the native shell the Capacitor Keyboard plugin can
// disable it (`setAccessoryBarVisible({ isVisible: false })`), so do that.
//
// `setResizeMode({ mode: Native })` makes the entire WKWebView resize when
// the keyboard appears, so `position: fixed; bottom: 0` naturally lands above
// the keyboard without any visualViewport math.
//
// For PWA Safari (web, not native), the accessory bar is unavoidable.
// useKeyboardInset() in main.tsx adds an empirical 44px offset to compensate.

async function registerKeyboard(): Promise<void> {
  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
  } catch {
    // Plugin not yet bridged or platform doesn't support — non-fatal.
  }
  if (nativePlatform() === "ios") {
    try {
      await Keyboard.setAccessoryBarVisible({ isVisible: false });
    } catch {
      // ignore — accessory bar fallback will still work via PWA logic if web
    }
  }
}

// ── Public init ────────────────────────────────────────────────────────────

interface BridgeOptions {
  onNetworkChange?: (status: ConnectionStatus) => void;
}

let initialised = false;

export async function initCapacitorBridge(options: BridgeOptions = {}): Promise<void> {
  if (initialised || !isNative()) return;
  initialised = true;
  await registerDeepLinkHandler();
  await registerKeyboard();
  if (options.onNetworkChange) {
    await registerNetworkHandler(options.onNetworkChange);
  }
}

/** Called from React once the first frame is visible. No-op on web. */
export async function hideSplashScreen(): Promise<void> {
  if (!isNative()) return;
  try {
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    /* ignore — splash already gone */
  }
}

/** Test seam — clear listeners so unit tests don't leak. */
export function _resetCapacitorBridgeForTests(): void {
  deepLinkUnsub?.();
  deepLinkUnsub = null;
  networkUnsub?.();
  networkUnsub = null;
  initialised = false;
  cachedNetwork = null;
}
