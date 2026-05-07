import { useEffect, useRef, useState } from "react";

// Pull-to-refresh hook attached to a scroll container.
//
// Activates only when the container's scrollTop is 0 AND the user drags
// down — never while scrolled mid-list, never on horizontal swipes.
// Distance is rubber-banded past the threshold so the indicator can't
// run off the screen. On release past the threshold we await the
// caller's onRefresh, then snap back. Touch-only (desktop has no
// pull gesture, would just intercept mouse drag-selection).

interface Options {
  threshold?: number; // pixels of pull before commit
  maxDistance?: number; // visual cap after rubber-band
  enabled?: boolean;
}

export function usePullToRefresh(
  // Accept the live element rather than a ref — callers feed this from
  // useState + a callback ref, which makes the hook re-bind whenever the
  // scroll container actually mounts/unmounts (e.g. when a `key={view}`
  // wrapper triggers a remount on view change).
  el: HTMLElement | null,
  onRefresh: () => Promise<void> | void,
  opts: Options = {},
) {
  const { threshold = 72, maxDistance = 110, enabled = true } = opts;
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Refs mirror state so the touch handlers (which close over the first
  // render's values) always read the live values without re-binding the
  // listener on every state change.
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled || !el) return;

    let startY = 0;
    let active = false;

    const setPull = (n: number) => {
      pullRef.current = n;
      setPullDistance(n);
    };

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return;
      // Only arm when the container is at the very top.
      if (el!.scrollTop > 0) return;
      // Single-finger gesture only — pinch / multi-touch ignored.
      if (e.touches.length !== 1) return;
      startY = e.touches[0]!.clientY;
      active = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!active) return;
      const dy = e.touches[0]!.clientY - startY;
      if (dy <= 0) {
        // User dragged up after starting at top — abandon, let native
        // scroll take over.
        active = false;
        if (pullRef.current !== 0) setPull(0);
        return;
      }
      // Rubber-band past the threshold so the indicator never flies off.
      const eased = dy < threshold ? dy : threshold + (dy - threshold) * 0.4;
      setPull(Math.min(eased, maxDistance));
    }

    async function onTouchEnd() {
      if (!active) return;
      active = false;
      const distance = pullRef.current;
      if (distance >= threshold) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPull(threshold); // park the indicator at threshold while refreshing
        try {
          await onRefreshRef.current();
        } catch {
          // surfacing errors here would just be a transient toast — the
          // subscribers themselves handle their own failure modes.
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    }

    // passive listeners — we never preventDefault on the gesture; iOS
    // bounce remains intact when the user pulls past the indicator.
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [el, threshold, maxDistance, enabled]);

  return { pullDistance, refreshing };
}
