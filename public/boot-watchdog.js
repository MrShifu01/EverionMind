// Boot watchdog. If React hasn't mounted (i.e. #root is still empty)
// 12s after the document becomes visible, force a reload. Catches the
// iOS PWA resume bug where the JS execution context freezes after a long
// background suspension — without this, the user sees a blank screen
// forever until they force-quit. sessionStorage gates the reload to once
// per session so a genuinely slow network can't create a reload loop.
//
// navigator.onLine gate: a user who is offline can never load the JS
// bundle from the network, so reloading them is pointless and creates
// a flicker loop. Skip the watchdog while offline; the SW cache will
// serve next reload regardless.
//
// Why this is loaded from /public/ instead of inline in index.html:
// CSP `script-src 'self'` blocks every inline <script> in production.
// Pinning a SHA-256 hash works once but breaks the moment any byte of
// this script changes — including a comment edit. Self-hosting it makes
// the boot path CSP-safe and edits don't require a new hash.
(function () {
  var KEY = "everion:boot-watchdog-fired";
  var TIMEOUT_MS = 12000;
  var timer = null;
  function arm() {
    if (timer) return;
    timer = setTimeout(function () {
      var root = document.getElementById("root");
      // React mounted if #root has children. Empty #root + 12s elapsed =
      // boot stuck.
      if (!root || root.children.length > 0) return;
      // Don't fire while the browser reports offline — the user has
      // no path to a fresh bundle, and the visible boot shell beats
      // a reload loop.
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      try {
        if (sessionStorage.getItem(KEY)) return;
        sessionStorage.setItem(KEY, "1");
      } catch {
        // private mode — proceed without dedup; one extra reload is
        // better than a permanent stuck splash.
      }
      window.location.reload();
    }, TIMEOUT_MS);
  }
  function disarm() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") arm();
    else disarm();
  });
  if (document.visibilityState === "visible") arm();
  // Once React renders into #root, the watchdog becomes a no-op even
  // if it fires (root.children.length > 0).
})();
