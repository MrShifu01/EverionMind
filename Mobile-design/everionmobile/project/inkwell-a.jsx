/* global React, MobileHeader, BrainRow, ModeToggle, CaptureSheet, RECENT_ENTRIES, TODAY,
   TweaksPanel, useTweaks, TweakSection, TweakColor, TweakRadio, TweakSlider, TweakToggle */

const { useState: useStateA, useRef: useRefA } = React;
/* global SlideMenu */

// ─── INKWELL · A — CLASSIC (clean) ─────────────────────────────────
// A single quiet inkwell. No floating ripples. Add-mode and Ask-mode
// share the same vessel — the affordance, prompt, and below-fold content
// swap based on which mode is active.

const TWEAKS_A = /*EDITMODE-BEGIN*/{
  "accent":      "ember",
  "wellSize":    220,
  "wellShape":   "round",
  "depthShadow": true,
  "showMeta":    true
}/*EDITMODE-END*/;

const ACCENTS = {
  ember:  "oklch(76% 0.105 82)",   // ember bronze
  copper: "oklch(68% 0.13 50)",
  brass:  "oklch(82% 0.09 95)",
  rust:   "oklch(58% 0.16 32)",
};

function InkwellA() {
  const [t, setTweak] = useTweaks(TWEAKS_A);
  const accent = ACCENTS[t.accent] || ACCENTS.ember;

  const [mode, setMode] = useStateA("add");
  const [brainId, setBrainId] = useStateA("personal");
  const [menuOpen, setMenuOpen] = useStateA(false);
  const [sheet, setSheet] = useStateA(false);
  const [pressed, setPressed] = useStateA(false);
  const [longPress, setLongPress] = useStateA(false);
  const lpTimer = useRefA(null);

  const onDown = () => { setPressed(true); lpTimer.current = setTimeout(() => setLongPress(true), 450); };
  const onUp = () => {
    setPressed(false);
    clearTimeout(lpTimer.current);
    if (!longPress) setSheet(true);
    setLongPress(false);
  };

  const borderRadius = t.wellShape === "round" ? "50%" : t.wellShape === "soft" ? "32%" : "18%";

  // Mode-specific copy
  const headline = mode === "add"
    ? <><span style={{ fontStyle: "italic", color: accent }}>Drop</span> a thought</>
    : <><span style={{ fontStyle: "italic", color: accent }}>Ask</span> your brain</>;
  const meta = mode === "add"
    ? `${TODAY} · 142 in the well`
    : `${TODAY} · search · recall · synthesize`;
  const caption = mode === "add"
    ? "tap · hold to record"
    : "tap to begin · pull from past";

  return (
    <div className="bronze-screen" style={{ padding: "8px 16px 22px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4 }}>
        <MobileHeader onMenu={() => setMenuOpen(true)} />
        <BrainRow brainId={brainId} setBrainId={setBrainId} />
        <ModeToggle mode={mode} setMode={setMode} />
      </div>

      <div style={{ marginTop: 14, textAlign: "center" }}>
        <div className="f-serif" style={{ fontSize: 26, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
          {headline}
        </div>
        <div className="f-mono" style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-faint)", textTransform: "uppercase", marginTop: 6 }}>
          {meta}
        </div>
      </div>

      {/* Inkwell stage */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", minHeight: 0 }}>
        <div style={{ position: "relative", width: t.wellSize, height: t.wellSize }}>
          {/* Outer brass rim */}
          <div style={{
            position: "absolute", inset: 0, borderRadius,
            background: `radial-gradient(circle at 50% 30%,
              color-mix(in oklch, ${accent} 28%, var(--surface)) 0%,
              var(--surface) 48%,
              var(--surface-low) 100%)`,
            border: `1px solid color-mix(in oklch, ${accent} 42%, transparent)`,
            boxShadow: t.depthShadow ? "var(--lift-2), inset 0 -8px 18px var(--scrim)" : "var(--lift-1)",
          }} />
          {/* Inner ring */}
          <div style={{
            position: "absolute", inset: 18, borderRadius,
            border: `1.5px solid color-mix(in oklch, ${accent} 55%, transparent)`,
            background: "var(--surface-dim)",
            boxShadow: "inset 0 4px 14px oklch(4% 0.01 250 / 0.8)",
          }} />
          {/* Push button — ember bronze on slate */}
          <button
            onPointerDown={onDown}
            onPointerUp={onUp}
            onPointerCancel={() => { setPressed(false); clearTimeout(lpTimer.current); setLongPress(false); }}
            aria-label={mode === "add" ? "Drop a thought" : "Ask your brain"}
            style={{
              position: "absolute", inset: 38, borderRadius,
              background: `radial-gradient(circle at 50% 30%,
                color-mix(in oklch, ${accent} 55%, var(--ember-deep)) 0%,
                color-mix(in oklch, ${accent} 30%, var(--ember-deep)) 50%,
                var(--ember-deep) 100%)`,
              border: `1px solid color-mix(in oklch, ${accent} 70%, transparent)`,
              cursor: "pointer", padding: 0,
              transform: pressed ? "scale(0.96)" : "scale(1)",
              transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              boxShadow: `
                inset 0 1px 0 color-mix(in oklch, ${accent} 85%, white),
                inset 0 -6px 14px color-mix(in oklch, var(--ember-deep) 80%, transparent),
                0 0 28px color-mix(in oklch, ${accent} 32%, transparent),
                var(--lift-2)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
              animation: longPress ? "inkwell-breathe 1.4s ease-in-out infinite" : "none",
            }}>
            {/* Soft top shimmer */}
            <span aria-hidden style={{
              position: "absolute", top: "14%", left: "22%",
              width: "44%", height: "22%",
              background: `radial-gradient(ellipse, color-mix(in oklch, white 32%, ${accent}) 0%, transparent 70%)`,
              filter: "blur(4px)", opacity: 0.85, borderRadius: "50%",
            }} />
            {/* Press ripples */}
            {pressed && (
              <>
                <span aria-hidden style={{
                  position: "absolute", inset: "30%", borderRadius,
                  border: `1.5px solid color-mix(in oklch, white 38%, ${accent})`,
                  animation: "inkwell-ripple 800ms ease-out forwards",
                }} />
                <span aria-hidden style={{
                  position: "absolute", inset: "30%", borderRadius,
                  border: `1px solid color-mix(in oklch, ${accent} 60%, transparent)`,
                  animation: "inkwell-ripple 800ms ease-out 200ms forwards",
                }} />
              </>
            )}
            <span className="f-serif" style={{
              position: "relative", zIndex: 1,
              fontSize: 36,
              color: "var(--ember-ink)",
              fontWeight: 300, lineHeight: 1,
              textShadow: "0 1px 2px color-mix(in oklch, var(--ember-deep) 60%, transparent)",
            }}>{mode === "add" ? "+" : "?"}</span>
          </button>
          {t.showMeta && (
            <div className="f-mono" style={{
              position: "absolute", bottom: -22, left: "50%", transform: "translateX(-50%)",
              fontSize: 9, letterSpacing: "0.2em", color: "var(--ink-faint)",
              textTransform: "uppercase", whiteSpace: "nowrap",
            }}>{caption}</div>
          )}
        </div>
      </div>

      {/* Ask mode — a single clear search input pinned to the bottom */}
      {mode === "ask" && (
        <div style={{ marginTop: 8 }}>
          <label
            htmlFor="ink-ask"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "0 14px",
              height: 52,
              background: "var(--surface)",
              border: `1px solid color-mix(in oklch, ${accent} 32%, var(--line-soft))`,
              borderRadius: 14,
              boxShadow: `0 0 0 4px color-mix(in oklch, ${accent} 8%, transparent), var(--lift-1)`,
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
            </svg>
            <input
              id="ink-ask"
              type="text"
              placeholder="Ask your second brain…"
              onFocus={() => setSheet(true)}
              style={{
                flex: 1, minWidth: 0, height: "100%",
                background: "transparent", border: "none", outline: "none",
                fontFamily: "var(--f-serif)",
                fontSize: 15, fontStyle: "italic",
                color: "var(--ink)",
              }}
            />
            <span className="f-mono" style={{
              fontSize: 9, letterSpacing: "0.16em",
              color: "var(--ink-faint)", textTransform: "uppercase",
              border: "1px solid var(--line-soft)",
              padding: "3px 6px", borderRadius: 6,
            }}>↵</span>
          </label>
        </div>
      )}

      <SlideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <CaptureSheet open={sheet} onClose={() => setSheet(false)} mode={mode} />

      <TweaksPanel title="Tweaks · Inkwell">
        <TweakSection label="Style">
          <TweakColor label="Accent" value={t.accent}
            options={[
              { value: "ember",  color: ACCENTS.ember  },
              { value: "copper", color: ACCENTS.copper },
              { value: "brass",  color: ACCENTS.brass  },
              { value: "rust",   color: ACCENTS.rust   },
            ]}
            onChange={v => setTweak("accent", v.value || v)} />
          <TweakRadio label="Well shape" value={t.wellShape}
            options={["round", "soft", "square"]}
            onChange={v => setTweak("wellShape", v)} />
        </TweakSection>
        <TweakSection label="Behavior">
          <TweakSlider label="Well size" value={t.wellSize}
            min={160} max={260} step={10} unit="px"
            onChange={v => setTweak("wellSize", v)} />
          <TweakToggle label="Meta caption" value={t.showMeta}
            onChange={v => setTweak("showMeta", v)} />
          <TweakToggle label="Depth shadow" value={t.depthShadow}
            onChange={v => setTweak("depthShadow", v)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

window.InkwellA = InkwellA;
