import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { Separator } from "../components/ui/separator";

export default function TermsOfService() {
  useDocumentMeta({
    title: "Terms of Service — Everion",
    description:
      "Everion terms of service: how the product works, what you can expect, and your rights as a user.",
    canonical: "https://everion.smashburgerbar.co.za/terms",
  });
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--ink)",
        fontFamily: "var(--f-sans)",
      }}
    >
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
          Terms
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
          Terms.
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
          Plain English. If any of this needs a lawyer to explain, write to us and we'll fix it.
        </p>

        <Section title="The deal">
          We give you a room. You put things in it. You own those things. We help you find them.
        </Section>

        <Section title="Your account">
          One person per account. You're responsible for keeping your email secure. Magic links are
          disposable — we'll email a fresh one every time.
        </Section>

        <Section title="What you can't do">
          Nothing illegal. Nothing that tries to break our service for others. Nothing that's
          someone else's copyrighted material they haven't let you store. Nothing that would make us
          a courier for malware.
        </Section>

        <Section title="What we can't do">
          Read your vault. Sell your data. Train on your writing. Keep your data if you ask us not
          to.
        </Section>

        <Section title="Payments">
          Pro is month-to-month. Cancel any time. We refund partial months if you ask politely.
        </Section>

        <Section title="If we change these terms">
          We'll email you 30 days before anything material changes. Using Everion after that counts
          as acceptance. If you disagree, export and leave — we won't be offended.
        </Section>

        <Section title="Third parties">
          The app uses Supabase (database + auth, EU West region), Vercel (hosting), Resend
          (transactional email), Sentry (error monitoring, no PII), PostHog (analytics, only after
          you consent), and Google Gemini (embeddings + enrichment). When you chat with your memory,
          the AI provider you select handles the request. Your use is also subject to their terms.
        </Section>

        <Section title="AI output">
          Everion uses AI to summarize, enrich, link, and answer questions about your entries. AI
          can be wrong, biased, or out of date. Treat its output as a starting point, not a fact.
          Don't rely on it for medical, legal, financial, or safety-critical decisions without
          checking the source.
        </Section>

        <Section title="Governing law">
          These terms are governed by the laws of South Africa. Disputes that can't be resolved
          informally go to the courts of South Africa, unless local consumer-protection law gives
          you a different right.
        </Section>

        <Section title="As-is">
          The service is provided "as is" without warranty of any kind. We're not liable for loss of
          data or damages arising from use of the service. Export regularly.
        </Section>

        <Separator className="my-12" />
        <div
          className="f-serif"
          style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-faint)" }}
        >
          last touched 27 April 2026. write to{" "}
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
