import { useEffect, useRef, useState, type JSX } from "react";

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
  docScrollY: number; // document.scrollingElement.scrollTop — catches html-element scroll
  windowScrollY: number; // window.scrollY — catches doc-element scroll
  bodyScrollY: number; // body.scrollTop — catches body-level scroll
  mhY: number | null; // MobileHome wrapper top
  mhH: number | null;
  taY: number | null; // textarea (ask everion…) top
  taH: number | null;
  orbY: number | null;
  orbH: number | null;
  // Chat composer tracking — for the "composer position varies across
  // mount" bug. The composer is data-diag="chat-composer" on the outer
  // padded div in ChatViewMobile. composerBottom is its bounding-box
  // bottom, gap is the distance from that to innerH.
  cmpY: number | null;
  cmpH: number | null;
  cmpBottom: number | null;
  cmpGap: number | null; // innerH - cmpBottom (positive = empty space below)
  mainH: number | null; // #main-content rect height
  mainBottom: number | null; // its bottom edge
  saB: string; // computed safe-area-inset-bottom probe
}

function isEnabled(): boolean {
  // FORCED ON for the chat-composer position bug investigation (no URL
  // bar on PWA → can't use ?debug=layout to toggle). Flip back to the
  // gated implementation (see git history) once the bug is diagnosed
  // and this file gets deleted along with the data-diag hooks.
  return true;
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
  const [dumpVisible, setDumpVisible] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string>("");
  const [collapsed, setCollapsed] = useState(false);
  // Pin to visualViewport. Without this, position:fixed anchors to the
  // layout viewport — when the soft keyboard opens and visualViewport
  // translates, the overlay scrolls off with the page and the user can't
  // see the numbers during the bug.
  const overlayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const pin = () => {
      const el = overlayRef.current;
      if (!el) return;
      el.style.transform = `translate3d(0, ${vv.offsetTop}px, 0)`;
    };
    pin();
    vv.addEventListener("resize", pin);
    vv.addEventListener("scroll", pin);
    return () => {
      vv.removeEventListener("resize", pin);
      vv.removeEventListener("scroll", pin);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    // Probe for safe-area-inset-bottom — there's no JS API; compute via a
    // throwaway absolutely-positioned div with padding-bottom: env(...).
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;padding-bottom:env(safe-area-inset-bottom);visibility:hidden";
    document.body.appendChild(probe);
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
      const cmp = document.querySelector('[data-diag="chat-composer"]');
      const innerH = window.innerHeight;
      const cmpR = cmp instanceof HTMLElement ? cmp.getBoundingClientRect() : null;
      const mainR = main ? main.getBoundingClientRect() : null;
      const saB = getComputedStyle(probe).paddingBottom;
      const row: Snapshot = {
        t: Date.now() - origin,
        tag,
        innerH,
        vvH: vv ? Math.round(vv.height) : null,
        vvTop: vv ? Math.round(vv.offsetTop) : null,
        vvScale: vv ? Number(vv.scale.toFixed(3)) : null,
        vvhVar: getComputedStyle(document.documentElement).getPropertyValue("--vvh").trim(),
        mainScrollY: main ? main.scrollTop : null,
        docScrollY: Math.round(document.scrollingElement?.scrollTop ?? 0),
        windowScrollY: Math.round(window.scrollY),
        bodyScrollY: Math.round(document.body.scrollTop),
        mhY: rect(mh)?.y ?? null,
        mhH: rect(mh)?.h ?? null,
        taY: rect(ta)?.y ?? null,
        taH: rect(ta)?.h ?? null,
        orbY: rect(orb)?.y ?? null,
        orbH: rect(orb)?.h ?? null,
        cmpY: cmpR ? Math.round(cmpR.y) : null,
        cmpH: cmpR ? Math.round(cmpR.height) : null,
        cmpBottom: cmpR ? Math.round(cmpR.bottom) : null,
        cmpGap: cmpR ? Math.round(innerH - cmpR.bottom) : null,
        mainH: mainR ? Math.round(mainR.height) : null,
        mainBottom: mainR ? Math.round(mainR.bottom) : null,
        saB,
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

    // Custom event: chat view dispatches `everion:diag-snap` with a tag
    // string in detail.tag on mount and again on next animation frame so
    // we capture pre-layout and post-layout positions.
    function onDiagSnap(e: Event) {
      const ce = e as CustomEvent<{ tag?: string }>;
      snap(`evt:${ce.detail?.tag ?? "?"}`);
    }
    window.addEventListener("everion:diag-snap", onDiagSnap as EventListener);

    snap("init");

    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      vv?.removeEventListener("resize", onVvResize);
      vv?.removeEventListener("scroll", onVvScroll);
      main?.removeEventListener("scroll", onMainScroll);
      window.removeEventListener("everion:diag-snap", onDiagSnap as EventListener);
      probe.remove();
    };
  }, [enabled, origin]);

  if (!enabled || !latest) return null;

  // Render the JSON dump in a textarea on tap so the user can long-press
  // to copy on iOS PWA where navigator.clipboard.writeText silently fails
  // (no clipboard permissions in standalone). Clipboard write attempted
  // in parallel — confirmation toast shows whichever succeeded.
  function showDump() {
    setDumpVisible(true);
  }

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed",
        // Centered horizontally; vertically pinned ~28% from top so the
        // panel sits in the upper-mid region of viewport and doesn't
        // obscure either the bottom composer (the thing we're measuring)
        // or the top header. Pin uses transform via the visualViewport
        // listener above for PWA / keyboard-open stability.
        top: "28vh",
        left: "50%",
        marginLeft: collapsed ? -40 : -130,
        zIndex: 2147483647,
        willChange: "transform",
        background: "rgba(0, 0, 0, 0.88)",
        color: "#0f0",
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        fontSize: 10,
        lineHeight: 1.3,
        padding: collapsed ? "3px 6px" : "6px 8px",
        borderRadius: 6,
        border: "1px solid #0f0",
        pointerEvents: "auto",
        width: collapsed ? 80 : 260,
        whiteSpace: "pre",
        userSelect: "text",
        boxShadow: "0 0 24px rgba(0, 255, 0, 0.25)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: collapsed ? 0 : 4,
        }}
      >
        <span style={{ fontWeight: 700 }}>{collapsed ? "diag" : "layout-diag"}</span>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand diagnostic" : "Collapse diagnostic"}
          style={{
            background: "transparent",
            color: "#0f0",
            border: "1px solid #0f0",
            borderRadius: 3,
            padding: "0 6px",
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          {collapsed ? "+" : "−"}
        </button>
      </div>
      {collapsed ? null : (
        <>
          {`tag: ${latest.tag}
t:   ${latest.t}ms
innerH: ${latest.innerH}
vvH:    ${latest.vvH}
vvTop:  ${latest.vvTop}
vvSc:   ${latest.vvScale}
--vvh:  ${latest.vvhVar}
sa-bot: ${latest.saB}
mainSY: ${latest.mainScrollY}
docSY:  ${latest.docScrollY}
winSY:  ${latest.windowScrollY}
bodySY: ${latest.bodyScrollY}
main:   y/h/b ${latest.mainBottom != null ? `?/${latest.mainH}/${latest.mainBottom}` : "—"}
mh y:   ${latest.mhY}  h:${latest.mhH}
ta y:   ${latest.taY}  h:${latest.taH}
orb y:  ${latest.orbY}  h:${latest.orbH}
cmp:    y:${latest.cmpY} h:${latest.cmpH}
        bot:${latest.cmpBottom} gap:${latest.cmpGap}
hist:   ${history.length}`}
          <button
            type="button"
            onClick={() => {
              showDump();
              // Try clipboard write in parallel — succeeds on Safari standalone
              // if user gesture is fresh; silent failure is fine because the
              // textarea below renders the same payload for manual selection.
              const text = history.map((r) => JSON.stringify(r)).join("\n");
              try {
                void navigator.clipboard
                  .writeText(text)
                  .then(() => setCopyMsg("clipboard: ok"))
                  .catch((e: Error) => setCopyMsg(`clipboard: ${e.name}`));
              } catch (e) {
                setCopyMsg(`clipboard: ${e instanceof Error ? e.name : "fail"}`);
              }
            }}
            style={{
              marginTop: 4,
              fontSize: 10,
              padding: "4px 6px",
              background: "#0f0",
              color: "#000",
              border: "none",
              borderRadius: 3,
              width: "100%",
              fontWeight: 700,
            }}
          >
            show + copy {history.length} events
          </button>
          {copyMsg ? (
            <div style={{ marginTop: 2, fontSize: 9, color: "#ff0" }}>{copyMsg}</div>
          ) : null}
          {dumpVisible ? (
            // No autofocus — that opens iOS keyboard and shrinks viewport,
            // shifting the very composer we're trying to measure. User can
            // tap to focus + long-press to copy manually.
            <textarea
              readOnly
              value={history.map((r) => JSON.stringify(r)).join("\n")}
              style={{
                marginTop: 4,
                width: "100%",
                height: 120,
                fontSize: 8,
                lineHeight: 1.2,
                fontFamily: "inherit",
                background: "#001a00",
                color: "#0f0",
                border: "1px solid #0f0",
                borderRadius: 3,
                padding: 4,
                userSelect: "text",
                WebkitUserSelect: "text",
                whiteSpace: "pre",
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
