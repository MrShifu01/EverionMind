export default function PrivacyPolicy() {
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

      <h1
        style={{
          fontFamily: "'Lora', Georgia, serif",
          fontSize: "clamp(26px, 4vw, 38px)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          margin: "0 0 8px",
        }}
      >
        Privacy Policy
      </h1>
      <p style={{ color: "var(--color-on-surface-variant)", fontSize: 13, margin: "0 0 40px" }}>
        Last updated: April 2026
      </p>

      <Section title="Overview">
        Everion is a personal knowledge management tool. This policy explains what data we collect,
        how it is processed, and which third-party services receive it.
      </Section>

      <Section title="Data we collect">
        <ul>
          <li>Your email address and authentication credentials (stored in Supabase).</li>
          <li>Entries, tags, links, and metadata you create inside the app.</li>
          <li>Push notification subscription tokens (stored in Supabase).</li>
          <li>
            Error events and stack traces sent to Sentry for debugging. Personally identifiable
            information (email, IP address) is <strong>not</strong> included in Sentry reports.
          </li>
        </ul>
      </Section>

      <Section title="Third-party services">
        <p>Everion uses the following external services:</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-outline-variant)" }}>
              <Th>Service</Th>
              <Th>Purpose</Th>
              <Th>Data sent</Th>
            </tr>
          </thead>
          <tbody>
            <Tr service="Supabase" purpose="Database, auth, file storage" data="All user data" />
            <Tr service="Gemini (Google)" purpose="AI entry analysis, embeddings" data="Entry content" />
            <Tr service="Groq" purpose="Fast AI inference (optional)" data="Entry content" />
            <Tr service="Vercel" purpose="Hosting, edge functions" data="Request metadata" />
            <Tr service="Sentry" purpose="Error monitoring" data="Stack traces (no PII)" />
          </tbody>
        </table>
        <p style={{ marginTop: 12 }}>
          AI providers process your entry content only to generate the requested response. We do not
          use your data to train external AI models.
        </p>
      </Section>

      <Section title="Data portability and deletion">
        You can export all your entries at any time from Settings → Account → Export Your Data. You
        can delete your account and all associated data from Settings → Account → Delete Account.
        This is permanent and cannot be undone.
      </Section>

      <Section title="GDPR and POPIA">
        If you are in the EU or South Africa, you have the right to access, correct, and delete your
        personal data. Contact us at{" "}
        <a href="mailto:stander.christian@gmail.com" style={{ color: "var(--color-primary)" }}>
          stander.christian@gmail.com
        </a>{" "}
        to exercise these rights.
      </Section>

      <Section title="Cookies and local storage">
        Everion stores session tokens and user preferences in browser local storage. No advertising
        or tracking cookies are used.
      </Section>

      <Section title="Contact">
        Questions about this policy:{" "}
        <a href="mailto:stander.christian@gmail.com" style={{ color: "var(--color-primary)" }}>
          stander.christian@gmail.com
        </a>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 17,
          fontWeight: 600,
          margin: "0 0 10px",
          color: "var(--color-on-surface)",
        }}
      >
        {title}
      </h2>
      <div style={{ color: "var(--color-on-surface-variant)", fontSize: 14 }}>{children}</div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "6px 8px",
        color: "var(--color-on-surface)",
        fontWeight: 600,
      }}
    >
      {children}
    </th>
  );
}

function Tr({
  service,
  purpose,
  data,
}: {
  service: string;
  purpose: string;
  data: string;
}) {
  return (
    <tr style={{ borderBottom: "1px solid var(--color-outline-variant)" }}>
      <td style={{ padding: "6px 8px" }}>{service}</td>
      <td style={{ padding: "6px 8px" }}>{purpose}</td>
      <td style={{ padding: "6px 8px" }}>{data}</td>
    </tr>
  );
}
