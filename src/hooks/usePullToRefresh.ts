import { useEffect, useRef, useState } from "react";

const THRESHOLD = 64; // px of pull needed to trigger refresh
const MAX_PULL = 96;  // max visual pull distance (rubber-bands here)

/**
 * Attaches global touch listeners to implement pull-to-refresh on window scroll.
 * Only activates when the page is scrolled to the top.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startYRef = useRef<number | null>(null);
  const pullDistRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0 || refreshingRef.current) return;
      startYRef.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startYRef.current === null || refreshingRef.current) return;
      if (window.scrollY > 0) {
        startYRef.current = null;
        pullDistRef.current = 0;
        setPullDistance(0);
        return;
      }
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        if (pullDistRef.current !== 0) {
          pullDistRef.current = 0;
          setPullDistance(0);
        }
        return;
      }
      // Rubber-band: slow down resistance as pull grows
      const d = Math.min(MAX_PULL, delta * 0.5);
      pullDistRef.current = d;
      setPullDistance(d);
    }

    async function onTouchEnd() {
      if (startYRef.current === null) return;
      startYRef.current = null;
      const d = pullDistRef.current;
      pullDistRef.current = 0;
      setPullDistance(0);

      if (d >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        try {
          await onRefreshRef.current();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
        }
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []); // stable — all mutable state accessed via refs

  return { pullDistance, refreshing };
}
