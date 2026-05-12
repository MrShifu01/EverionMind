import { useEffect, useState, type JSX } from "react";

// Temporary diagnostic for the "click-out-click-in shoots everything above
// the screen" bug on /home. Gated by either:
//   - URL query param: any page with ?debug=layout (persists via localStorage)
//   - direct localStorage flag (desktop devtools workflow)
//
// Mobile enable: visit https://app.url/anything?debug=layout — flag is
// stored in localStorage and survives navigation. Visit again with
// ?debug=off to clear.
//
// Desktop enable:   localStorage.setItem('everion:debug-layout', '1'); location.reload();
// Desktop disable:  localStorage.removeItem('everion:debug-layout'); location.reload();
//
// Once we have numbers and a fix, delete this file + the mount in main.tsx.

interface Snapshot {
  t: number; // ms since enable
  tag: string; // which event triggered this row
  innerH: number; // window.innerHeight
  vvH: number | null; // visualViewport.height
  vvTop: number | null;
  vvScale: number | null;
  vvhVar: string; // computed --vvh
  mainScrollY: number | null; // #main-content.scrollTop
  mhY: number | null; // MobileHome wrapper top
  mhH: number | null;
  taY: number | null; // textarea (ask everion…) top
  taH: number | null;
  orbY: number | null;
  orbH: number | null;
}

function isEnabled(): boolean {
  try {
    // URL query param overrides localStorage so a phone user can toggle
    // the overlay just by appending ?debug=layout (or ?debug=off) to any
    // page URL. The flag is then persisted to localStorage so subsequent
    // navigations still show the overlay.
    const params = new URLSearchParams(window.location.search);
    const debugParam = params.get("debug");
    if (debugParam === "layout") {
      try {
        localStorage.setItem("everion:debug-layout", "1");
      } catch {
        // ignore
      }
      return true;
    }
    if (debugParam === "off") {
      try {
        localStorage.removeItem("everion:debug-layout");
      } catch {
        // ignore
      }
      return false;
    }
    return localStorage.getItem("everion:debug-layout") === "1";
  } catch {
    return false;
  }
}

function rect(el: Element | null | undefined): { y: number; h: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { y: Math.round(r.y), h: Math.round(r.height) };
}

export default function LayoutDiagOverlay(): JSX.Element | null {
  const [enabled] = useState(() => isEnabled());
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [origin] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    function snap(tag: string) {
      const vv = window.visualViewport;
      const main = document.getElementById("main-content");
      const ta = document.querySelector(
        'textarea[placeholder*="ask everion"], textarea[placeholder*="loading brain"]',
      );
      // MobileHome wrapper — closest div ancestor of ta with min-height
      // in its inline style.
      let mh: Element | null = null;
      let p: Element | null = ta;
      while (p) {
        const s = p instanceof HTMLElement ? p.getAttribute("style") || "" : "";
        if (s.includes("min-height") && s.includes("vvh")) {
          mh = p;
          break;
        }
        p = p.parentElement;
      }
      const orb = document.querySelector("button[data-mode]");
      const row: Snapshot = {
        t: Date.now() - origin,
        tag,
        innerH: window.innerHeight,
        vvH: vv ? Math.round(vv.height) : null,
        vvTop: vv ? Math.round(vv.offsetTop) : null,
        vvScale: vv ? Number(vv.scale.toFixed(3)) : null,
        vvhVar: getComputedStyle(document.documentElement).getPropertyValue("--vvh").trim(),
        mainScrollY: main ? main.scrollTop : null,
        mhY: rect(mh)?.y ?? null,
        mhH: rect(mh)?.h ?? null,
        taY: rect(ta)?.y ?? null,
        taH: rect(ta)?.h ?? null,
        orbY: rect(orb)?.y ?? null,
        orbH: rect(orb)?.h ?? null,
      };
      setLatest(row);
      setHistory((h) => [...h.slice(-24), row]);
      // also dump to console for paste-back
      console.log("[layout-diag]", JSON.stringify(row));
    }
    function onFocusIn(e: FocusEvent) {
      const t = e.target as HTMLElement | null;
      snap(`focusin:${t?.tagName ?? "?"}`);
    }
    function onFocusOut(e: FocusEvent) {
      const t = e.target as HTMLElement | null;
      snap(`focusout:${t?.tagName ?? "?"}`);
    }
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);

    const vv = window.visualViewport;
    function onVvResize() {
      snap("vv:resize");
    }
    function onVvScroll() {
      snap("vv:scroll");
    }
    vv?.addEventListener("resize", onVvResize);
    vv?.addEventListener("scroll", onVvScroll);

    const main = document.getElementById("main-content");
    function onMainScroll() {
      snap("main:scroll");
    }
    main?.addEventListener("scroll", onMainScroll);

    snap("init");

    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      vv?.removeEventListener("resize", onVvResize);
      vv?.removeEventListener("scroll", onVvScroll);
      main?.removeEventListener("scroll", onMainScroll);
    };
  }, [enabled, origin]);

  if (!enabled || !latest) return null;

  function copyHistory() {
    const text = history.map((r) => JSON.stringify(r)).join("\n");
    try {
      void navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top, 0px) + 4px)",
        right: 4,
        zIndex: 99999,
        background: "rgba(0, 0, 0, 0.78)",
        color: "#0f0",
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        fontSize: 9,
        lineHeight: 1.25,
        padding: "4px 6px",
        borderRadius: 4,
        pointerEvents: "auto",
        maxWidth: 220,
        whiteSpace: "pre",
        userSelect: "text",
      }}
    >
      {`tag: ${latest.tag}
t:   ${latest.t}ms
innerH: ${latest.innerH}
vvH:    ${latest.vvH}
vvTop:  ${latest.vvTop}
vvSc:   ${latest.vvScale}
--vvh:  ${latest.vvhVar}
mainSY: ${latest.mainScrollY}
mh y:   ${latest.mhY}  h:${latest.mhH}
ta y:   ${latest.taY}  h:${latest.taH}
orb y:  ${latest.orbY}  h:${latest.orbH}
hist:   ${history.length}`}
      <button
        type="button"
        onClick={copyHistory}
        style={{
          marginTop: 4,
          fontSize: 9,
          padding: "2px 6px",
          background: "#0f0",
          color: "#000",
          border: "none",
          borderRadius: 3,
          width: "100%",
        }}
      >
        copy {history.length} events
      </button>
    </div>
  );
}
