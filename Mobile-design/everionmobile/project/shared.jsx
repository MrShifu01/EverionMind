/* global React */
const { useState, useRef, useEffect } = React;

// ─── shared bits ────────────────────────────────────────────────
const TODAY = "Tue, May 12";

const BRAINS = [
  { id: "personal",  name: "Personal",      glyph: "●", color: "var(--ember)" },
  { id: "work",      name: "Work",          glyph: "▲", color: "oklch(70% 0.08 200)" },
  { id: "writing",   name: "The Book",      glyph: "✦", color: "oklch(72% 0.09 320)" },
  { id: "family",    name: "Family",        glyph: "❋", color: "oklch(68% 0.09 152)" },
];

const RECENT_ENTRIES = [
  { meta: "MON · 11:42 PM", body: "Realized the Roma trip works better if we anchor to Trastevere — quieter mornings, walkable to the river." },
  { meta: "MON · 4:18 PM",  body: "M. mentioned her dad's birthday is the 27th. Get something handwritten." },
  { meta: "SUN · 9:03 AM",  body: "The book idea — start with the bridge story, not the prologue. Trust the reader." },
];

const PLACEHOLDER_ASK = [
  "what was that book i wanted to read?",
  "what did i say about the roma trip?",
  "remind me what m. needs by friday",
];

function HeaderIcon({ label, onClick, badge, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="b-press"
      style={{
        position: "relative",
        width: 34, height: 34, borderRadius: 10,
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        color: "var(--ink-soft)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", padding: 0,
      }}>
      {children}
      {badge && (
        <span style={{
          position: "absolute", top: 5, right: 5,
          width: 7, height: 7, borderRadius: "50%",
          background: "var(--ember)",
          boxShadow: "0 0 6px var(--ember)",
        }} />
      )}
    </button>
  );
}

function MobileHeader({ onSearch, onBell, onMenu, hasNotif = true }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 4px", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={onMenu}
          aria-label="Menu"
          className="b-press"
          style={{
            width: 34, height: 34, borderRadius: 10,
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            color: "var(--ink-soft)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", padding: 0,
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
        <div className="b-logo">
          <span className="b-logo-mark"><span></span></span>
          <span>everion</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <HeaderIcon label="Search" onClick={onSearch}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
        </HeaderIcon>
        <HeaderIcon label="Notifications" onClick={onBell} badge={hasNotif}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 1 1 12 0c0 4 1.5 5 2 6H4c.5-1 2-2 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/>
          </svg>
        </HeaderIcon>
      </div>
    </div>
  );
}

function BrandHeader({ tone = "default", brainId: brainIdProp, setBrainId: setBrainIdProp }) {
  const [open, setOpen] = useState(false);
  const [internalBrainId, setInternalBrainId] = useState("personal");
  const brainId = brainIdProp ?? internalBrainId;
  const setBrainId = setBrainIdProp ?? setInternalBrainId;
  const active = BRAINS.find(b => b.id === brainId) || BRAINS[0];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px", position: "relative" }}>
      <div className="b-logo">
        <span className="b-logo-mark"><span></span></span>
        <span>everion</span>
      </div>

      {/* Brain switcher (right side) */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setOpen(o => !o)}
          className="b-press"
          aria-label={`Active brain: ${active.name}. Tap to switch.`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            height: 28, padding: "0 10px 0 8px",
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: 999,
            color: "var(--ink)",
            fontFamily: "var(--f-sans)",
            fontSize: 12, fontWeight: 500,
            cursor: "pointer",
          }}>
          <span style={{
            width: 16, height: 16, borderRadius: "50%",
            background: `color-mix(in oklch, ${active.color} 22%, var(--surface-low))`,
            border: `1px solid color-mix(in oklch, ${active.color} 60%, transparent)`,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: active.color, fontSize: 9, lineHeight: 1,
          }}>{active.glyph}</span>
          <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{active.name}</span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.6 }}>
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{
              position: "fixed", inset: 0, zIndex: 40,
            }} />
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0,
              minWidth: 180,
              background: "var(--surface-high)",
              border: "1px solid var(--line-soft)",
              borderRadius: 14,
              padding: 6,
              boxShadow: "var(--lift-3)",
              zIndex: 41,
              animation: "b-fadein 180ms ease both",
            }}>
              <div className="f-mono" style={{
                fontSize: 9, letterSpacing: "0.16em",
                textTransform: "uppercase", color: "var(--ink-faint)",
                padding: "4px 8px 6px",
              }}>Switch brain</div>
              {BRAINS.map(b => {
                const isActive = b.id === brainId;
                return (
                  <button key={b.id}
                    onClick={() => { setBrainId && setBrainId(b.id); setOpen(false); }}
                    className="b-press"
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "8px 8px",
                      background: isActive ? "var(--ember-wash)" : "transparent",
                      border: "none", borderRadius: 8,
                      color: "var(--ink)", cursor: "pointer",
                      fontFamily: "var(--f-sans)", fontSize: 13, fontWeight: 500,
                      textAlign: "left",
                    }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: `color-mix(in oklch, ${b.color} 22%, var(--surface-low))`,
                      border: `1px solid color-mix(in oklch, ${b.color} 60%, transparent)`,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      color: b.color, fontSize: 11, flexShrink: 0,
                    }}>{b.glyph}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{b.name}</span>
                    {isActive && (
                      <span className="f-mono" style={{
                        fontSize: 9, letterSpacing: "0.16em",
                        color: "var(--ember)", textTransform: "uppercase",
                      }}>active</span>
                    )}
                  </button>
                );
              })}
              <div style={{ height: 1, background: "var(--line-soft)", margin: "4px 6px" }} />
              <button className="b-press" style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "8px 8px",
                background: "transparent", border: "none", borderRadius: 8,
                color: "var(--ink-soft)", cursor: "pointer",
                fontFamily: "var(--f-sans)", fontSize: 13,
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: "50%",
                  border: "1px dashed var(--line)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: "var(--ink-faint)", fontSize: 14, lineHeight: 1,
                }}>+</span>
                <span>New brain</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModeToggle({ mode, setMode }) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div className="b-toggle">
        <span className="b-toggle-thumb" style={{ transform: `translateX(${mode === "add" ? 0 : 78}px)` }} />
        {["add", "ask"].map(m => (
          <button key={m}
            className="b-toggle-btn b-press"
            onClick={() => setMode(m)}
            style={{ color: mode === m ? "var(--ember-ink)" : "var(--ink-soft)" }}>
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

function RecentPeek({ entry, compact = false }) {
  return (
    <div className="b-recent">
      <div className="b-recent-meta">{entry.meta}</div>
      <div className="b-recent-body" style={compact ? { WebkitLineClamp: 1 } : {}}>{entry.body}</div>
    </div>
  );
}

// Capture sheet — slides up
function CaptureSheet({ open, onClose, initialText = "", mode = "add" }) {
  const [text, setText] = useState(initialText);
  const ref = useRef(null);
  useEffect(() => { if (open && ref.current) ref.current.focus(); }, [open]);
  useEffect(() => { setText(initialText); }, [initialText, open]);
  if (!open) return null;
  return (
    <>
      <div className="b-sheet-scrim" onClick={onClose} />
      <div className="b-sheet">
        <div className="b-sheet-grip" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div className="b-chip">
            <span className="b-chip-dot"></span>
            <span>{mode === "add" ? "NEW MEMORY" : "ASKING"}</span>
          </div>
          <button onClick={onClose} className="b-press"
            style={{ background: "transparent", border: "none", color: "var(--ink-faint)", fontSize: 18, cursor: "pointer", padding: 4 }}>
            ✕
          </button>
        </div>
        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={mode === "add" ? "what's on your mind?" : "ask me anything you've told me…"}
          className="b-input f-serif"
          style={{ minHeight: 120, fontSize: 16, fontStyle: "italic" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {["voice", "photo", "link"].map(t => (
              <button key={t} className="b-press"
                style={{
                  background: "var(--surface-low)", border: "1px solid var(--line-soft)",
                  borderRadius: 999, padding: "6px 12px", color: "var(--ink-soft)",
                  fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.1em",
                  textTransform: "uppercase", cursor: "pointer"
                }}>{t}</button>
            ))}
          </div>
          <button onClick={onClose} className="b-press"
            style={{
              background: "var(--ember)", color: "var(--ember-ink)",
              border: "none", borderRadius: 999, padding: "8px 18px",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
              fontFamily: "var(--f-sans)",
            }}>
            {mode === "add" ? "save" : "ask"} ↵
          </button>
        </div>
      </div>
    </>
  );
}

// Compact brain-row that sits under the mobile header — same dropdown logic
function BrainRow({ brainId: brainIdProp, setBrainId: setBrainIdProp }) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState("personal");
  const brainId = brainIdProp ?? internal;
  const setBrainId = setBrainIdProp ?? setInternal;
  const active = BRAINS.find(b => b.id === brainId) || BRAINS[0];
  return (
    <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="b-press"
        aria-label={`Active brain: ${active.name}. Tap to switch.`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          height: 30, padding: "0 12px 0 8px",
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: 999,
          color: "var(--ink)", fontFamily: "var(--f-sans)",
          fontSize: 12, fontWeight: 500, cursor: "pointer",
        }}>
        <span style={{
          width: 18, height: 18, borderRadius: "50%",
          background: `color-mix(in oklch, ${active.color} 22%, var(--surface-low))`,
          border: `1px solid color-mix(in oklch, ${active.color} 60%, transparent)`,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: active.color, fontSize: 10, lineHeight: 1,
        }}>{active.glyph}</span>
        <span className="f-mono" style={{ fontSize: 9, letterSpacing: "0.16em", color: "var(--ink-faint)", textTransform: "uppercase" }}>brain</span>
        <span>{active.name}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.55 }}>
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
            minWidth: 200, background: "var(--surface-high)",
            border: "1px solid var(--line-soft)", borderRadius: 14, padding: 6,
            boxShadow: "var(--lift-3)", zIndex: 41,
            animation: "b-fadein 180ms ease both",
          }}>
            {BRAINS.map(b => {
              const isActive = b.id === brainId;
              return (
                <button key={b.id}
                  onClick={() => { setBrainId(b.id); setOpen(false); }}
                  className="b-press"
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "8px 8px",
                    background: isActive ? "var(--ember-wash)" : "transparent",
                    border: "none", borderRadius: 8, color: "var(--ink)",
                    cursor: "pointer", fontFamily: "var(--f-sans)",
                    fontSize: 13, fontWeight: 500, textAlign: "left",
                  }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: `color-mix(in oklch, ${b.color} 22%, var(--surface-low))`,
                    border: `1px solid color-mix(in oklch, ${b.color} 60%, transparent)`,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    color: b.color, fontSize: 11, flexShrink: 0,
                  }}>{b.glyph}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{b.name}</span>
                  {isActive && <span className="f-mono" style={{ fontSize: 9, letterSpacing: "0.16em", color: "var(--ember)", textTransform: "uppercase" }}>active</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const MENU_SECTIONS = [
  {
    title: "Library",
    items: [
      { icon: "well",     label: "Inkwell",       meta: "today" },
      { icon: "calendar", label: "Timeline",      meta: "142" },
      { icon: "tag",      label: "Threads",       meta: "18" },
      { icon: "voice",    label: "Voice notes",   meta: "9" },
      { icon: "photo",    label: "Captures",      meta: "37" },
    ],
  },
  {
    title: "Workspaces",
    items: [
      { icon: "brain",  label: "Personal",   meta: "active", swatch: "oklch(76% 0.105 82)" },
      { icon: "brain",  label: "Book draft", meta: "shared", swatch: "oklch(68% 0.13 50)"  },
      { icon: "brain",  label: "Work",       meta: "",       swatch: "oklch(82% 0.09 95)"  },
    ],
  },
  {
    title: "Settings",
    items: [
      { icon: "key",   label: "Connections" },
      { icon: "lock",  label: "Privacy & vault" },
      { icon: "tune",  label: "Appearance" },
      { icon: "user",  label: "Account" },
    ],
  },
];

function MenuIcon({ kind }) {
  const stroke = "currentColor";
  const sw = 1.6;
  const svgProps = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (kind) {
    case "well":     return <svg {...svgProps}><ellipse cx="12" cy="9" rx="7" ry="3"/><path d="M5 9c0 5 2 9 7 9s7-4 7-9"/></svg>;
    case "calendar": return <svg {...svgProps}><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>;
    case "tag":      return <svg {...svgProps}><path d="M3 12 12 3h8v8l-9 9z"/><circle cx="15" cy="8" r="1.2"/></svg>;
    case "voice":    return <svg {...svgProps}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>;
    case "photo":    return <svg {...svgProps}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m3 18 5-5 4 4 3-3 6 6"/></svg>;
    case "brain":    return <svg {...svgProps}><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 5 3 3 0 0 0 4 3V4z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1 5 3 3 0 0 1-4 3V4z"/></svg>;
    case "key":      return <svg {...svgProps}><circle cx="8" cy="15" r="4"/><path d="m10.5 13 9-9M16 7l2 2M14 9l2 2"/></svg>;
    case "lock":     return <svg {...svgProps}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>;
    case "tune":     return <svg {...svgProps}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>;
    case "user":     return <svg {...svgProps}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
    default:         return null;
  }
}

function SlideMenu({ open, onClose }) {
  return (
    <>
      {/* Scrim */}
      <div onClick={onClose} aria-hidden style={{
        position: "absolute", inset: 0, zIndex: 60,
        background: "color-mix(in oklch, oklch(8% 0.01 250) 60%, transparent)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 280ms cubic-bezier(0.4, 0, 0.2, 1)",
      }} />
      {/* Drawer */}
      <aside aria-hidden={!open} style={{
        position: "absolute", top: 0, left: 0, bottom: 0,
        width: "82%", maxWidth: 320,
        zIndex: 61,
        transform: open ? "translateX(0)" : "translateX(-101%)",
        transition: "transform 360ms cubic-bezier(0.16, 1, 0.3, 1)",
        background: `linear-gradient(180deg,
          color-mix(in oklch, var(--ember) 14%, var(--surface-high)) 0%,
          var(--surface-high) 30%,
          var(--surface) 100%)`,
        borderRight: "1px solid color-mix(in oklch, var(--ember) 28%, var(--line-soft))",
        boxShadow: "8px 0 40px oklch(4% 0.01 250 / 0.55)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Decorative brass arc */}
        <div aria-hidden style={{
          position: "absolute", top: -120, right: -120,
          width: 280, height: 280, borderRadius: "50%",
          background: `radial-gradient(circle, color-mix(in oklch, var(--ember) 28%, transparent), transparent 65%)`,
          filter: "blur(20px)", pointerEvents: "none",
        }} />
        <div aria-hidden style={{
          position: "absolute", top: 18, left: 18, right: 18,
          height: 1,
          background: `linear-gradient(90deg, transparent, color-mix(in oklch, var(--ember) 45%, transparent), transparent)`,
          opacity: 0,
        }} />

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px 12px",
          borderBottom: "1px solid color-mix(in oklch, var(--ember) 14%, var(--line-soft))",
          position: "relative", zIndex: 1,
        }}>
          <div className="b-logo">
            <span className="b-logo-mark"><span></span></span>
            <span>everion</span>
          </div>
          <button onClick={onClose} aria-label="Close menu" className="b-press" style={{
            width: 30, height: 30, borderRadius: 8,
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            color: "var(--ink-soft)", cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            padding: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6l-12 12"/>
            </svg>
          </button>
        </div>

        {/* User card */}
        <div style={{
          margin: "12px 12px 4px",
          padding: "10px 12px",
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--surface)",
          border: "1px solid color-mix(in oklch, var(--ember) 22%, var(--line-soft))",
          borderRadius: 12,
          position: "relative", zIndex: 1,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: `linear-gradient(135deg, color-mix(in oklch, var(--ember) 60%, var(--ember-deep)), var(--ember-deep))`,
            border: "1px solid color-mix(in oklch, var(--ember) 70%, transparent)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "var(--ember-ink)", fontFamily: "var(--f-serif)",
            fontSize: 15, fontWeight: 500,
            boxShadow: "0 0 14px color-mix(in oklch, var(--ember) 30%, transparent)",
          }}>M</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="f-serif" style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.1 }}>Maya Ferrante</div>
            <div className="f-mono" style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--ink-faint)", marginTop: 3 }}>142 memories · 18 threads</div>
          </div>
        </div>

        {/* Sections */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 8px 12px", position: "relative", zIndex: 1 }}>
          {MENU_SECTIONS.map((sec, si) => (
            <div key={sec.title} style={{ marginTop: si === 0 ? 6 : 14 }}>
              <div className="f-mono" style={{
                fontSize: 9, letterSpacing: "0.2em",
                color: "var(--ink-faint)", textTransform: "uppercase",
                padding: "4px 12px 6px",
              }}>{sec.title}</div>
              {sec.items.map((it, ii) => (
                <button key={ii} className="b-press" style={{
                  display: "flex", alignItems: "center", gap: 12,
                  width: "100%", padding: "10px 12px",
                  background: "transparent", border: "none",
                  borderRadius: 10, cursor: "pointer",
                  color: "var(--ink)", fontFamily: "var(--f-sans)",
                  fontSize: 14, textAlign: "left",
                }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: 9,
                    background: it.swatch
                      ? `color-mix(in oklch, ${it.swatch} 18%, var(--surface-low))`
                      : "var(--surface-low)",
                    border: `1px solid ${it.swatch ? `color-mix(in oklch, ${it.swatch} 50%, transparent)` : "var(--line-soft)"}`,
                    color: it.swatch || "var(--ink-soft)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}><MenuIcon kind={it.icon}/></span>
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {it.meta && (
                    <span className="f-mono" style={{
                      fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase",
                      color: it.meta === "active" ? "var(--ember)" : "var(--ink-faint)",
                      padding: it.meta === "active" ? "3px 7px" : 0,
                      background: it.meta === "active" ? "var(--ember-wash)" : "transparent",
                      borderRadius: 999,
                      border: it.meta === "active" ? "1px solid color-mix(in oklch, var(--ember) 36%, transparent)" : "none",
                    }}>{it.meta}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{
          padding: "10px 14px 14px",
          borderTop: "1px solid color-mix(in oklch, var(--ember) 14%, var(--line-soft))",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "relative", zIndex: 1,
        }}>
          <div className="f-mono" style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--ink-faint)", textTransform: "uppercase" }}>v0.4 · 2026</div>
          <button className="b-press" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 10px",
            background: "transparent",
            border: "1px solid var(--line-soft)",
            borderRadius: 999,
            color: "var(--ink-soft)", cursor: "pointer",
            fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>
            </svg>
            sign out
          </button>
        </div>
      </aside>
    </>
  );
}

Object.assign(window, { BrandHeader, MobileHeader, BrainRow, SlideMenu, ModeToggle, RecentPeek, CaptureSheet, TODAY, RECENT_ENTRIES, PLACEHOLDER_ASK, BRAINS });
