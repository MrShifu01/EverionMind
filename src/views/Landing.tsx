/**
 * Landing page — ported from EverionV2-handoff/project/landing.jsx
 *
 * A full marketing surface: hero with typing capture bar, what-it-is,
 * four pillars, demo section, pricing, and footer.
 *
 * Business logic: navigation only. Auth happens in LoginScreen; clicks on
 * "Sign in" / "Start remembering" call onAuth.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";

interface LandingProps {
  onAuth: (mode: "login" | "signup") => void;
}

const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";

function Motes({ count = 44 }: { count?: number }) {
  const [motes] = useState(() =>
    Array.from({ length: count }, () => {
      const size = 1 + Math.random() * 3;
      return {
        size,
        top: Math.random() * 100,
        left: Math.random() * 100,
        dx: (Math.random() - 0.5) * 60 + "px",
        dy: (Math.random() - 0.5) * 80 + "px",
        dur: 14 + Math.random() * 18,
        delay: Math.random() * -20,
        op: 0.06 + Math.random() * 0.12,
        bHigh: 0.06 + Math.random() * 0.12,
        bLow: 0.02 + Math.random() * 0.05,
        breatheDur: 8 + Math.random() * 6,
      };
    }),
  );
  return (
    <div className="motes" aria-hidden="true">
      {motes.map((m, i) => (
        <div
          key={i}
          className="mote"
          data-ambient
          style={{
            width: m.size,
            height: m.size,
            top: m.top + "%",
            left: m.left + "%",
            opacity: m.op,
            ["--dx" as string]: m.dx,
            ["--dy" as string]: m.dy,
            ["--b-high" as string]: String(m.bHigh),
            ["--b-low" as string]: String(m.bLow),
            animation: `design-drift ${m.dur}s ease-in-out infinite ${m.delay}s, design-breathe ${m.breatheDur}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <span
      className="f-sans"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        background: "var(--surface-low)",
        border: "1px solid var(--line)",
        borderRadius: 4,
        fontSize: 11,
        color: "var(--ink-faint)",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

function Micro({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="micro" style={style}>
      {children}
    </div>
  );
}

function Pillar({ n, title, sub, body }: { n: string; title: string; sub: string; body: string }) {
  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 24 }}>
      <div className="micro" style={{ color: "var(--ember)", marginBottom: 20 }}>
        {n}
      </div>
      <h3
        className="f-serif"
        style={{
          fontSize: 28,
          lineHeight: 1.1,
          fontWeight: 450,
          margin: 0,
          letterSpacing: "-0.01em",
          color: "var(--ink)",
        }}
      >
        {title}
      </h3>
      <div
        className="f-serif"
        style={{
          fontStyle: "italic",
          color: "var(--ink-faint)",
          fontSize: 14,
          marginTop: 4,
        }}
      >
        {sub}
      </div>
      <p
        className="f-serif"
        style={{
          fontSize: 16,
          lineHeight: 1.55,
          color: "var(--ink-soft)",
          marginTop: 16,
        }}
      >
        {body}
      </p>
    </div>
  );
}

function PlanCard({
  tier,
  price,
  suffix,
  body,
  bullets,
  cta,
  onCta,
  featured,
}: {
  tier: string;
  price: string;
  suffix?: string;
  body: string;
  bullets: string[];
  cta: string;
  onCta: () => void;
  featured?: boolean;
}) {
  return (
    <div
      className="press"
      style={{
        padding: 32,
        background: featured ? "var(--surface-high)" : "var(--surface)",
        border: `1px solid ${featured ? "var(--ember)" : "var(--line-soft)"}`,
        borderRadius: 18,
        transition: "all 240ms",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        className="f-serif"
        style={{ fontSize: 14, color: "var(--ink-faint)", fontStyle: "italic", marginBottom: 8 }}
      >
        {tier}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 20 }}>
        <span
          className="f-serif"
          style={{
            fontSize: 56,
            lineHeight: 1,
            fontWeight: 400,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          {price}
        </span>
        {suffix && (
          <span className="f-sans" style={{ color: "var(--ink-faint)", fontSize: 14 }}>
            {suffix}
          </span>
        )}
      </div>
      <p
        className="f-serif"
        style={{
          fontSize: 15,
          lineHeight: 1.5,
          color: "var(--ink-soft)",
          minHeight: 50,
          margin: 0,
        }}
      >
        {body}
      </p>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "20px 0",
          fontSize: 14,
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
        className="f-sans"
      >
        {bullets.map((b) => (
          <li
            key={b}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 0",
              color: "var(--ink-soft)",
            }}
          >
            <svg
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              style={{ color: featured ? "var(--ember)" : "var(--ink-faint)", flexShrink: 0 }}
              aria-hidden="true"
            >
              <path d="M5 12l4 4 10-10" />
            </svg>
            {b}
          </li>
        ))}
      </ul>
      <button
        className={`${featured ? "design-btn-primary" : "design-btn-secondary"} press`}
        style={{ width: "100%", height: 44, minHeight: 44, marginTop: "auto" }}
        onClick={onCta}
      >
        {cta}
      </button>
    </div>
  );
}

function LandingDemo() {
  const [input, setInput] = useState(
    "she said the thing that tipped it was realizing she hadn't opened her sketchbook in four months",
  );
  const [saved, setSaved] = useState(false);
  const inferredType = /reminder|call|email|text/i.test(input)
    ? "reminder"
    : /http|aeon|com\b|\.co/i.test(input)
      ? "link"
      : /story|maybe|idea/i.test(input)
        ? "idea"
        : "note";
  const concepts = ["priya", "friendship", "career"];
  return (
    <div
      className="landing-demo-grid"
      style={{
        marginTop: 48,
        display: "grid",
        gap: 32,
        maxWidth: 1000,
      }}
    >
      <div>
        <Micro style={{ marginBottom: 12 }}>you type</Micro>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 18,
            padding: 20,
            minHeight: 200,
          }}
        >
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setSaved(false);
            }}
            className="f-serif"
            placeholder="type anything…"
            style={{
              width: "100%",
              minHeight: 120,
              resize: "none",
              fontSize: 17,
              lineHeight: 1.55,
              color: "var(--ink)",
              background: "transparent",
              border: 0,
              outline: 0,
              padding: 0,
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--ink-faint)",
                fontSize: 13,
              }}
            >
              <span className="f-sans">inferred: {inferredType}</span>
            </div>
            <button
              className="design-btn-primary press"
              style={{ height: 34, minHeight: 34, fontSize: 13 }}
              onClick={() => setSaved(true)}
            >
              Capture
            </button>
          </div>
        </div>
      </div>
      <div>
        <Micro style={{ marginBottom: 12 }}>everion finds</Micro>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 18,
            padding: 20,
            minHeight: 200,
          }}
        >
          <div className="micro" style={{ color: "var(--ember)", marginBottom: 10 }}>
            {saved ? "● saved · concepts extracted" : "○ preview — unsaved"}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            {concepts.map((c) => (
              <span key={c} className="design-chip f-sans" style={{ fontSize: 12 }}>
                {c}
              </span>
            ))}
          </div>
          <Micro style={{ marginBottom: 10, opacity: 0.7 }}>related, already in memory</Micro>
          <div style={{ borderLeft: "2px solid var(--line-soft)", paddingLeft: 14 }}>
            <div
              className="f-serif"
              style={{ fontSize: 15, fontWeight: 450, marginBottom: 2, color: "var(--ink)" }}
            >
              Coffee with Priya — she's leaving the firm
            </div>
            <div
              className="f-serif"
              style={{ fontSize: 13, color: "var(--ink-faint)", fontStyle: "italic" }}
            >
              5 days ago · friendship, career
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FooterCol({
  title,
  links,
  go,
}: {
  title: string;
  links: [string, string][];
  go: (to: string) => void;
}) {
  return (
    <div>
      <Micro style={{ marginBottom: 14 }}>{title}</Micro>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {links.map(([label, to]) => (
          <a
            key={label}
            onClick={() => go(to)}
            className="f-sans press"
            style={{
              fontSize: 14,
              color: "var(--ink-soft)",
              cursor: "pointer",
              background: "transparent",
            }}
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function Landing({ onAuth }: LandingProps) {
  const [typed, setTyped] = useState("");
  const phrases = useMemo(
    () => [
      "a line from the poem I couldn't stop thinking about…",
      "what dad said at the kitchen table on Sunday…",
      "the name of the jacket I saw in the window on Kloof…",
      "a half-formed idea for a short story about dreams…",
    ],
    [],
  );
  const [pIdx, setPIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setTyped(phrases[0]);
      return;
    }
    const cur = phrases[pIdx];
    const t = setTimeout(
      () => {
        if (!deleting) {
          if (charIdx < cur.length) {
            setTyped(cur.slice(0, charIdx + 1));
            setCharIdx((c) => c + 1);
          } else {
            setTimeout(() => setDeleting(true), 2400);
          }
        } else {
          if (charIdx > 0) {
            setTyped(cur.slice(0, charIdx - 1));
            setCharIdx((c) => c - 1);
          } else {
            setDeleting(false);
            setPIdx((p) => (p + 1) % phrases.length);
          }
        }
      },
      deleting ? 22 : 42 + Math.random() * 30,
    );
    return () => clearTimeout(t);
  }, [charIdx, deleting, pIdx, phrases]);

  const goto = (to: string) => {
    if (to === "login") onAuth("login");
    else if (to === "signup") onAuth("signup");
    else if (to === "privacy") window.location.assign("/privacy");
    else if (to === "terms") window.location.assign("/terms");
    else if (to === "memory") onAuth("login");
    else if (to.startsWith("landing#")) {
      const id = to.slice("landing#".length);
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div
      className="scrollbar-hide"
      style={{
        height: "100vh",
        overflowY: "auto",
        position: "relative",
        background: "var(--bg)",
        color: "var(--ink)",
      }}
    >
      {/* Top nav */}
      <header
        className="landing-nav"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 40px",
          background: "color-mix(in oklch, var(--bg) 82%, transparent)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--line-soft)",
          gap: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="f-serif"
            style={{
              fontSize: 22,
              letterSpacing: "-0.01em",
              fontWeight: 450,
              color: "var(--ink)",
            }}
          >
            Everion
          </span>
          <span
            aria-hidden="true"
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "var(--ember)",
              animation: "design-breathe 3.5s ease-in-out infinite",
            }}
          />
        </div>
        <nav
          className="landing-nav-links f-sans"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            fontSize: 13,
            color: "var(--ink-faint)",
          }}
        >
          <a className="press" onClick={() => goto("landing#what")} style={{ cursor: "pointer" }}>
            What it is
          </a>
          <a
            className="press"
            onClick={() => goto("landing#pricing")}
            style={{ cursor: "pointer" }}
          >
            Pricing
          </a>
          <a className="press" onClick={() => goto("privacy")} style={{ cursor: "pointer" }}>
            Privacy
          </a>
          <button
            className="design-btn-secondary press"
            style={{ height: 36, minHeight: 36, fontSize: 13, whiteSpace: "nowrap" }}
            onClick={() => goto("login")}
          >
            Sign in
          </button>
          <button
            className="design-btn-primary press"
            style={{ height: 36, minHeight: 36, fontSize: 13, whiteSpace: "nowrap" }}
            onClick={() => goto("signup")}
          >
            Start remembering
          </button>
        </nav>
      </header>

      {/* HERO */}
      <section
        style={{
          position: "relative",
          minHeight: "calc(100vh - 80px)",
          padding: "80px 40px 120px",
          overflow: "hidden",
        }}
      >
        <Motes count={44} />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "30%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 900,
            height: 900,
            borderRadius: "50%",
            background: "radial-gradient(circle, var(--ember-wash) 0%, transparent 60%)",
            pointerEvents: "none",
            opacity: 0.6,
          }}
        />
        <div
          style={{
            position: "relative",
            maxWidth: 940,
            margin: "0 auto",
            textAlign: "center",
            paddingTop: 80,
          }}
        >
          <div className="micro anim-fade-up" style={{ marginBottom: 24, animationDelay: "50ms" }}>
            <span style={{ color: "var(--ember)" }}>●</span> A quiet place for the things you want
            to remember
          </div>
          <h1
            className="f-serif anim-fade-up"
            style={{
              fontSize: "clamp(48px, 8vw, 104px)",
              lineHeight: 0.98,
              fontWeight: 400,
              margin: 0,
              letterSpacing: "-0.025em",
              fontVariationSettings: '"opsz" 72',
              color: "var(--ink)",
              animationDelay: "120ms",
            }}
          >
            your second memory,
            <br />
            <span style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>quietly kept.</span>
          </h1>
          <p
            className="f-serif anim-fade-up"
            style={{
              fontSize: "clamp(17px, 2vw, 22px)",
              lineHeight: 1.5,
              color: "var(--ink-soft)",
              maxWidth: 620,
              margin: "36px auto 48px",
              animationDelay: "240ms",
            }}
          >
            Everion is a private room where you keep notes, links, half-thoughts and the things
            worth not forgetting — and an AI that actually reads them when you ask.
          </p>

          {/* Live-feeling capture bar */}
          <div
            className="anim-fade-up"
            style={{ animationDelay: "360ms", maxWidth: 640, margin: "0 auto" }}
          >
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 28,
                padding: "14px 18px 14px 24px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                boxShadow: "var(--lift-2)",
              }}
            >
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                style={{ color: "var(--ember)", flexShrink: 0 }}
                aria-hidden="true"
              >
                <path d="M5 19c3-9 8-14 14-14-1 6-4 12-12 14M8 12l4 4" />
              </svg>
              <div
                className="f-serif"
                style={{
                  flex: 1,
                  textAlign: "left",
                  fontSize: 17,
                  color: "var(--ink-soft)",
                  fontStyle: "italic",
                  minHeight: 26,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {typed}
                <span
                  style={{
                    display: "inline-block",
                    width: 1,
                    height: 18,
                    background: "var(--ember)",
                    marginLeft: 2,
                    animation: "design-breathe 1s ease-in-out infinite",
                    ["--b-low" as string]: "0.2",
                    ["--b-high" as string]: "1",
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Kbd>{MOD}</Kbd>
                <Kbd>K</Kbd>
              </div>
            </div>
            <div className="micro" style={{ marginTop: 14, opacity: 0.7 }}>
              nothing leaves your device until you say so · end-to-end encrypted vault
            </div>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <div
            className="f-serif"
            style={{
              fontSize: 14,
              fontStyle: "italic",
              color: "var(--ink-ghost)",
              textAlign: "center",
            }}
          >
            what it does
            <br />
            <span style={{ fontSize: 20 }}>↓</span>
          </div>
        </div>
      </section>

      {/* WHAT IT IS */}
      <section id="what" style={{ padding: "120px 40px", maxWidth: 1120, margin: "0 auto" }}>
        <Micro style={{ marginBottom: 24 }}>What Everion is</Micro>
        <h2
          className="f-serif"
          style={{
            fontSize: "clamp(32px, 5vw, 56px)",
            lineHeight: 1.1,
            fontWeight: 400,
            margin: 0,
            letterSpacing: "-0.02em",
            maxWidth: 880,
            color: "var(--ink)",
          }}
        >
          It is the place where the thought goes —{" "}
          <span style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>
            and then stays findable.
          </span>
        </h2>
        <p
          className="f-serif"
          style={{
            fontSize: 19,
            lineHeight: 1.6,
            color: "var(--ink-soft)",
            maxWidth: 680,
            marginTop: 32,
          }}
        >
          Not a to-do app. Not a chat-with-your-docs. Not a wiki you have to organize. Everion is
          one opinionated surface for capture, one for chat, one for the shape of what you know. It
          treats your memory like a place — warm, private, uncluttered — not a database.
        </p>
      </section>

      {/* FOUR PILLARS */}
      <section style={{ padding: "40px 40px 120px", maxWidth: 1120, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 24,
          }}
        >
          <Pillar
            n="01"
            title="Capture"
            sub="lighter than opening a text box"
            body="Tap once on desktop, thumb once on mobile. Text, voice, paste, file, photo. No form. No title required. It's fast enough that you actually use it."
          />
          <Pillar
            n="02"
            title="Recall"
            sub="ask, don't search"
            body="Chat with your memory. The AI reads your entries, cites sources, and answers in plain language. 'what did I save about my dad this year' works."
          />
          <Pillar
            n="03"
            title="Synthesize"
            sub="connections you didn't see"
            body="Everion notices when three notes rhyme. It surfaces unexpected pairings. Not a daily report — a quiet nudge when something's worth the glance."
          />
          <Pillar
            n="04"
            title="The Shape"
            sub="the night sky of your mind"
            body="Every entry becomes a concept. Concepts become constellations. Pan around the idea-sky you've been making without meaning to."
          />
        </div>
      </section>

      {/* DEMO */}
      <section
        style={{
          padding: "120px 40px",
          background: "var(--surface-low)",
          borderTop: "1px solid var(--line-soft)",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <Micro style={{ marginBottom: 16 }}>A demo — not a screenshot</Micro>
          <h2
            className="f-serif"
            style={{
              fontSize: "clamp(28px, 4.5vw, 48px)",
              lineHeight: 1.1,
              fontWeight: 400,
              margin: 0,
              letterSpacing: "-0.02em",
              maxWidth: 820,
              color: "var(--ink)",
            }}
          >
            Type a thought. Watch it find its place.
          </h2>
          <p
            className="f-serif"
            style={{
              fontSize: 17,
              lineHeight: 1.6,
              color: "var(--ink-soft)",
              maxWidth: 620,
              marginTop: 20,
            }}
          >
            This is real. The entries below are what Everion would save if you typed right now.
          </p>
          <LandingDemo />
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: "120px 40px", maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <Micro style={{ marginBottom: 16 }}>Pricing</Micro>
          <h2
            className="f-serif"
            style={{
              fontSize: "clamp(32px, 5vw, 56px)",
              lineHeight: 1.1,
              fontWeight: 400,
              margin: 0,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            Two tiers. Both honest.
          </h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
            maxWidth: 780,
            margin: "0 auto",
          }}
        >
          <PlanCard
            tier="Hobby"
            price="free"
            body="Unlimited entries, local-first, end-to-end encrypted vault, one brain, bring your own AI key."
            bullets={[
              "Unlimited entries",
              "Local-first, offline",
              "Encrypted vault",
              "Bring your own AI key",
            ]}
            cta="Start free"
            onCta={() => goto("signup")}
          />
          <PlanCard
            tier="Pro"
            price="$6"
            suffix="/mo"
            body="For the people who actually live here. Hosted AI, sync across devices, shared brains, priority support."
            bullets={[
              "Everything in Hobby",
              "Hosted AI (no key required)",
              "Cross-device sync",
              "Shared brains with 2 people",
              "Export anywhere, anytime",
            ]}
            cta="Start 14-day trial"
            onCta={() => goto("signup")}
            featured
          />
        </div>
      </section>

      {/* FOOTER */}
      <footer
        style={{
          padding: "56px 40px 32px",
          borderTop: "1px solid var(--line-soft)",
          background: "var(--surface-dim)",
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 32,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span
                className="f-serif"
                style={{ fontSize: 20, fontWeight: 450, color: "var(--ink)" }}
              >
                Everion
              </span>
              <span
                aria-hidden="true"
                style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--ember)" }}
              />
            </div>
            <p
              className="f-serif"
              style={{
                fontSize: 14,
                color: "var(--ink-faint)",
                lineHeight: 1.5,
                fontStyle: "italic",
                maxWidth: 220,
                margin: 0,
              }}
            >
              a room, not a tool.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              ["What it is", "landing#what"],
              ["Pricing", "landing#pricing"],
              ["Privacy", "privacy"],
              ["Terms", "terms"],
            ]}
            go={goto}
          />
          <FooterCol
            title="For you"
            links={[
              ["Sign in", "login"],
              ["Sign up", "signup"],
            ]}
            go={goto}
          />
          <FooterCol
            title="Support"
            links={[
              ["Privacy policy", "privacy"],
              ["Terms of service", "terms"],
            ]}
            go={goto}
          />
        </div>
        <div
          style={{
            maxWidth: 1120,
            margin: "40px auto 0",
            display: "flex",
            justifyContent: "space-between",
            color: "var(--ink-ghost)",
            fontSize: 12,
          }}
        >
          <span>© {new Date().getFullYear()} Everion</span>
          <span className="f-serif" style={{ fontStyle: "italic" }}>
            quietly kept
          </span>
        </div>
      </footer>

      {/* Responsive CSS */}
      <style>{`
        .landing-demo-grid { grid-template-columns: 1fr 1fr; }
        @media (max-width: 820px) {
          .landing-demo-grid { grid-template-columns: 1fr !important; }
          .landing-nav { padding: 14px 20px !important; }
          .landing-nav-links { gap: 12px !important; }
          .landing-nav-links a:not(button) { display: none !important; }
        }
      `}</style>
    </div>
  );
}
