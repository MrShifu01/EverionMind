export default function PrivacyPolicy() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--ink)",
        fontFamily: "var(--f-sans)",
      }}
    >
      {/* Brand header with back link */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 40px",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <a
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          <span
            className="f-serif"
            style={{
              fontSize: 20,
              fontWeight: 450,
              letterSpacing: "-0.01em",
              color: "var(--ink)",
            }}
          >
            Everion
          </span>
          <span
            aria-hidden="true"
            style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--ember)" }}
          />
        </a>
        <a
          href="/"
          className="design-btn-ghost press"
          style={{
            fontSize: 13,
            height: 36,
            minHeight: 36,
            padding: "0 12px",
            textDecoration: "none",
          }}
        >
          ← back to home
        </a>
      </header>

      <article
        className="scrollbar-hide"
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "80px clamp(20px, 5vw, 48px) 120px",
        }}
      >
        <div className="micro" style={{ marginBottom: 24 }}>
          Privacy
        </div>
        <h1
          className="f-serif"
          style={{
            fontSize: "clamp(40px, 7vw, 56px)",
            lineHeight: 1.05,
            fontWeight: 400,
            margin: 0,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          Privacy.
        </h1>
        <p
          className="f-serif"
          style={{
            fontSize: 20,
            lineHeight: 1.5,
            color: "var(--ink-soft)",
            fontStyle: "italic",
            margin: "24px 0 56px",
          }}
        >
          Everion is as private as a notebook in your drawer. Here's what that means, exactly.
        </p>

        <Section title="What we store">
          Your entries, your concepts, your sync metadata. That's it. We do not store your device
          ID, your IP beyond 24 hours, or any analytics about what you wrote.
        </Section>

        <Section title="End-to-end encryption">
          Vault entries are encrypted on your device with a key derived from your passphrase. We
          never see the key. If you forget it, we can't help you recover the vault — that's the
          point.
        </Section>

        <Section title="AI processing">
          When you chat with your memory, the entries relevant to your question are sent to the AI
          provider of your choice (Anthropic, OpenAI, Google, or Groq — bring your own key).
          Providers don't train on your data, under our agreements.
        </Section>

        <Section title="Third parties">
          Supabase (database + auth), your chosen AI provider, Vercel (hosting), and Sentry (error
          monitoring, no PII). No analytics services. No ad networks. No session replay.
        </Section>

        <Section title="Your rights">
          Export, delete, transfer. All self-service, no email required. A full account delete
          scrubs every row we have of you within 48 hours. GDPR and POPIA requests can go to{" "}
          <a href="mailto:stander.christian@gmail.com" style={{ color: "var(--ember)" }}>
            stander.christian@gmail.com
          </a>
          .
        </Section>

        <Section title="Cookies & local storage">
          Everion stores session tokens and preferences in browser local storage. No advertising
          cookies, no tracking cookies.
        </Section>

        <div style={{ height: 1, background: "var(--line-soft)", margin: "48px 0 20px" }} />
        <div
          className="f-serif"
          style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-faint)" }}
        >
          last touched 21 April 2026. write to{" "}
          <a href="mailto:stander.christian@gmail.com" style={{ color: "var(--ember)" }}>
            stander.christian@gmail.com
          </a>{" "}
          if anything here isn't clear.
        </div>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2
        className="f-serif"
        style={{
          fontSize: 24,
          lineHeight: 1.2,
          fontWeight: 450,
          letterSpacing: "-0.01em",
          color: "var(--ink)",
          margin: 0,
        }}
      >
        {title}
      </h2>
      <div
        className="f-serif"
        style={{
          fontSize: 17,
          lineHeight: 1.65,
          color: "var(--ink-soft)",
          marginTop: 12,
        }}
      >
        {children}
      </div>
    </section>
  );
}
