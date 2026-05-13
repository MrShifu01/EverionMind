/// <reference types="@capacitor/keyboard" />

import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

// Capacitor wrap for Everion Mind. Single TS source, native shells per store.
// Bundle ID locked in LAUNCH_CHECKLIST.md (M0 — 2026-04-29 decisions).
//
// `webDir` points at Vite's build output. Run `npm run build && npx cap sync`
// before opening the native projects to refresh the bundled web assets.
//
// `androidScheme: 'https'` keeps Service-Worker + secure-context features
// working inside the Android WebView (default `http` blocks them).
const config: CapacitorConfig = {
  appId: "com.everionmind.app",
  appName: "Everion Mind",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  ios: {
    contentInset: "automatic",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#FAF6EF",
      androidScaleType: "CENTER_CROP",
      splashImmersive: false,
    },
    // `Native` resizes the whole WKWebView when the keyboard appears, so
    // anything pinned with `bottom: 0` (Ask sheet, Capture sheet) naturally
    // floats above the keyboard with no manual math. `resizeOnFullScreen`
    // covers Android immersive mode. The iOS accessory bar (prev/next/Done
    // chrome above the keyboard that was covering the input) is hidden in
    // capacitorBridge.ts via setAccessoryBarVisible — runtime call, not
    // configurable here.
    Keyboard: {
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
