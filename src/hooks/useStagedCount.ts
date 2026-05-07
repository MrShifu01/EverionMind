import { useEffect, useState } from "react";
import { authFetch } from "../lib/authFetch";

// App-shell hook for the count of items waiting in the staging inbox
// (Gmail-scanned entries with status='staged'). Used by the Settings nav
// to show a chip when there's something to review. Refreshes on:
//   - mount
//   - the `everion:staged-changed` window event (dispatched after a scan
//     completes or after the user reviews/dismisses items in the inbox)
// Keeps the cost low by skipping refetches when there's no listener.
export function useStagedCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      authFetch("/api/entries?staged=true")
        .then((r) => r?.json?.())
        .then((d) => {
          if (cancelled) return;
          const entries = Array.isArray(d?.entries) ? d.entries : [];
          setCount(entries.length);
        })
        .catch(() => {});
    }
    refresh();
    window.addEventListener("everion:staged-changed", refresh);
    window.addEventListener("everion:pull-refresh", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("everion:staged-changed", refresh);
      window.removeEventListener("everion:pull-refresh", refresh);
    };
  }, []);

  return count;
}
