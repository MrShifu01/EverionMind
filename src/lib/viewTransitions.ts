// ============================================================
// View Transitions API helper
// ============================================================
//
// Thin wrapper around `document.startViewTransition` with feature
// detection + React-aware state-flushing. Lets the rest of the app
// describe transitions declaratively:
//
//   startViewTransition(() => navigate("chat"));
//
// Without this helper, naive `document.startViewTransition(cb)` calls
// race against React's batched rendering — the cb captures the "before"
// snapshot, the state setter inside it queues a re-render that happens
// AFTER the API has already snapshotted "after", and you get an
// instantaneous swap instead of a morph.
//
// We use React.flushSync inside the callback so React commits the state
// change synchronously, the API captures the post-state snapshot, and
// the browser animates between the two captures.
//
// Browser support:
//   Chrome 111+, Edge 111+, Safari 18.0+, Firefox 130+. On older
//   browsers `startViewTransition` is undefined — we fall back to
//   running the callback synchronously (instant swap, no animation).
//   No errors, no flicker, no special-casing required at call sites.
//
// reduced-motion respect:
//   `@media (prefers-reduced-motion: reduce)` users get the instant
//   fallback even on supporting browsers. CSS in index.css disables
//   the animation pseudo-elements globally for that media query.

import { flushSync } from "react-dom";

type DocumentWithVT = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => {
    finished: Promise<void>;
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
    skipTransition: () => void;
  };
};

/** True when the browser supports the View Transitions API. */
export function supportsViewTransitions(): boolean {
  if (typeof document === "undefined") return false;
  return typeof (document as DocumentWithVT).startViewTransition === "function";
}

/** True when the user has prefers-reduced-motion enabled. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Run a DOM mutation inside a view transition.
 *
 * - On supporting browsers + motion enabled: snapshots before, runs the
 *   callback with React state flushed synchronously, snapshots after,
 *   and animates between the two via the browser's default cross-fade
 *   (or custom CSS keyed on `view-transition-name`).
 * - On unsupported browsers or reduced-motion: runs the callback
 *   immediately. Identical end state, no animation.
 *
 * The callback should perform the DOM mutation (typically a React
 * setState that changes which component is rendered or where an
 * element with `view-transition-name` is positioned).
 */
export function startViewTransition(update: () => void): void {
  if (!supportsViewTransitions() || prefersReducedMotion()) {
    update();
    return;
  }
  const doc = document as DocumentWithVT;
  doc.startViewTransition!(() => {
    // React 18+: flushSync forces the setState inside `update` to
    // commit before this callback returns, so the browser's "after"
    // snapshot reflects the new DOM. Without this, the snapshot
    // captures the pre-update DOM and the morph is invisible.
    flushSync(() => {
      update();
    });
  });
}
