export default function TermsOfService() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-surface)",
        color: "var(--color-on-surface)",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        padding: "clamp(32px, 5vw, 64px) clamp(16px, 5vw, 48px)",
        maxWidth: 720,
        margin: "0 auto",
        lineHeight: 1.7,
      }}
    >
      <a
        href="/"
        style={{
          color: "var(--color-primary)",
          fontSize: 13,
          fontWeight: 500,
          textDecoration: "none",
          display: "inline-block",
          marginBottom: 32,
        }}
      >
        ← Back
      </a>

      <h1 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, marginBottom: 8 }}>
        Terms of Service
      </h1>
      <p style={{ fontSize: 13, opacity: 0.5, marginBottom: 40 }}>Last updated: April 2026</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>
        1. Acceptance
      </h2>
      <p>
        By using Everion Mind you agree to these terms. If you do not agree, do not use the service.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>
        2. Description of Service
      </h2>
      <p>
        Everion Mind is a personal knowledge management tool that lets you capture, organise, and
        query information using AI. The service is provided as-is and may change at any time.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>
        3. Your Data
      </h2>
      <p>
        You own all content you store. We do not sell your data. You can export or delete your data
        at any time via Settings. Deleted entries are permanently purged after 30 days.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>
        4. Acceptable Use
      </h2>
      <p>
        You may not use Everion Mind to store illegal content, to infringe third-party rights, or to
        attempt to circumvent any security measure.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>
        5. Third-Party Services
      </h2>
      <p>
        The app uses Supabase (database), Sentry (error monitoring), Vercel (hosting), Google
        Gemini, and Groq for AI features. Your use is also subject to their respective terms.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>
        6. Disclaimer
      </h2>
      <p>
        The service is provided "as is" without warranty of any kind. We are not liable for any loss
        of data or damages arising from use of the service.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32, marginBottom: 8 }}>
        7. Contact
      </h2>
      <p>
        Questions? Email{" "}
        <a
          href="mailto:stander.christian@gmail.com"
          style={{ color: "var(--color-primary)", textDecoration: "underline" }}
        >
          stander.christian@gmail.com
        </a>
        .
      </p>
    </div>
  );
}
