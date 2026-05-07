import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { Separator } from "../components/ui/separator";

export default function PrivacyPolicy() {
  useDocumentMeta({
    title: "Privacy — Everion",
    description:
      "How Everion handles your data. End-to-end encrypted vault for true secrets (AES-GCM 256, PBKDF2 310k), BYO AI key, full export anytime. POPIA + GDPR compliant.",
    canonical: "https://everion.smashburgerbar.co.za/privacy",
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
            margin: "24px 0 40px",
          }}
        >
          Everion is as private as a notebook in your drawer — with an encrypted vault for the few
          real secrets (passwords, credit cards, recovery codes, PINs). Here's what that means,
          exactly.
        </p>

        {/* Quick scan / table of contents */}
        <nav
          aria-label="On this page"
          style={{
            margin: "0 0 56px",
            padding: 20,
            background: "var(--surface)",
            border: "1px solid var(--line-soft)",
            borderRadius: 14,
          }}
        >
          <div className="micro" style={{ marginBottom: 12 }}>
            On this page
          </div>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 14,
            }}
          >
            {[
              ["What we store", "what-we-store"],
              ["The vault — for true secrets", "vault"],
              ["End-to-end encryption", "encryption"],
              ["AI processing — exactly what is sent where", "ai"],
              ["Where your data lives", "where"],
              ["What you can take with you (export)", "export"],
              ["Retention & deletion", "retention"],
              ["Your rights", "rights"],
              ["Cookies & local storage", "cookies"],
            ].map(([label, anchor]) => (
              <li key={anchor}>
                <a
                  href={`#${anchor}`}
                  style={{
                    color: "var(--ink-soft)",
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                    textDecorationColor: "var(--line)",
                  }}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Section title="What we store" id="what-we-store">
          Of your content: your entries, your concepts, and the sync metadata they need. That's it —
          we don't analyze, mine, or sell what you wrote. We do not store your device ID or your IP
          address beyond 24 hours.
        </Section>

        <Section title="The vault — for true secrets" id="vault">
          The vault is the part of Everion designed to hold things that have to stay locked:
          passwords, credit card numbers, recovery codes, PINs, seed phrases — anything you'd
          otherwise put in a password manager. It's a small, narrow tool by design. Everything else
          worth remembering lives as a regular entry.
          <br />
          <br />
          Vault entries are encrypted on your device with a passphrase only you know.{" "}
          <strong>
            We never see the passphrase, and we cannot decrypt vault entries on our side.
          </strong>{" "}
          When you set up the vault, we generate a one-time recovery key and show it to you to write
          down. We store an encrypted blob of your vault key on our server — encrypted with that
          recovery key — so the only way it ever becomes useful is if <em>you</em> bring the
          recovery key back. Lose both the passphrase and the recovery key, and the vault is
          unrecoverable. Storing a credit card or recovery code here should not feel safer than
          storing them in 1Password; this is built so it doesn't.
          <br />
          <br />
          Vault content is also kept out of the AI pipeline — embeddings and chat context use your
          regular entries only, never vault entries.
        </Section>

        <Section title="End-to-end encryption" id="encryption">
          <strong>Algorithm:</strong> AES-GCM 256-bit, with keys derived from your passphrase via
          PBKDF2 (310,000 iterations, SHA-256, browser-native WebCrypto). Encryption and decryption
          happen inside your browser — the unencrypted plaintext of a vault entry never touches our
          servers.
          <br />
          <br />
          <strong>What we can see vs. can't:</strong> we can see that <em>you</em> have an entry
          (its row exists, its size, when it was created); we cannot see what's inside a vault
          entry. Regular (non-vault) entries are stored in our database in a form we can read — this
          is what enables search and AI chat. If something has to be vault-grade private, put it in
          the vault.
          <br />
          <br />
          <strong>Keys never leave your device unencrypted.</strong> The only key material that
          touches our server is the recovery blob (your vault key encrypted with your one-time
          recovery key). Without your recovery key, the blob is opaque to us. We get a lot of
          "please reset my vault" emails — and unless you still have your recovery key, we can't.
        </Section>

        <Section title="AI processing — exactly what is sent where" id="ai">
          <strong>Embeddings (search):</strong> when you create a regular entry, its text is sent to
          Google Gemini to produce an embedding vector. The embedding stays in our database; the
          text round-trip is one call, no training. Vault entries are never embedded.
          <br />
          <br />
          <strong>Chat (recall):</strong> when you ask your memory a question, the entries that
          match your question are sent — along with your question — to whichever AI provider you've
          configured. With your own API key, the request goes through your provider account, not
          ours. With the hosted Gemini option (Pro), the request goes through ours.
          <br />
          <br />
          <strong>What providers see:</strong> the entries relevant to your specific question, plus
          your question. Not your full memory, not your account, not metadata they don't need. Under
          our agreements with OpenAI, Anthropic, Groq, and Google, none of them train on your data.
          <br />
          <br />
          <strong>What providers don't see:</strong> vault content, your encryption keys, your
          unrelated entries.
        </Section>

        <Section title="Where your data lives" id="where">
          Database and auth: Supabase, EU West (Ireland). Hosting: Vercel global edge network.
          Transactional email: Resend. Error monitoring: Sentry (no PII). Product analytics:
          PostHog, only after you accept the consent banner — and never your entry contents. No ad
          networks. No session replay.
        </Section>

        <Section title="What you can take with you (export)" id="export">
          Your data is yours. From <em>Settings → Data</em> you can export:
          <ul style={{ margin: "12px 0 12px 20px", padding: 0 }}>
            <li>
              your entries as <strong>JSON</strong> or <strong>CSV</strong>
            </li>
            <li>
              your contacts as <strong>vCard</strong>
            </li>
            <li>
              your full account dump (every row we hold of you) as a single <strong>JSON</strong>{" "}
              file — the GDPR / POPIA right-of-access export
            </li>
          </ul>
          Vault entries are included in the full export as their original AES-GCM ciphertext. Our
          server cannot decrypt them — only your in-app vault, with your passphrase, can. Today the
          path back in is the app itself; a separate offline decryption tool is on the roadmap so
          your encrypted vault remains readable even if we vanish.
          <br />
          <br />
          We make this easy on purpose: the moment a privacy-first product can hold your data
          hostage, the privacy claim is empty.
        </Section>

        <Section title="Retention & deletion" id="retention">
          We keep your data while your account exists so the app can do its job. When you delete
          your account, every row we have of you is scrubbed within 48 hours, including embeddings,
          push subscriptions, and integration tokens. Vault entries — being encrypted — were already
          unreadable to us; we delete the ciphertext too.
        </Section>

        <Section title="Your rights" id="rights">
          Export, delete, transfer. All self-service, no email required. POPIA (South Africa) and
          GDPR (EU) requests — including right of access, rectification, and erasure — can go to{" "}
          <a href="mailto:stander.christian@gmail.com" style={{ color: "var(--ember)" }}>
            stander.christian@gmail.com
          </a>
          .
        </Section>

        <Section title="Cookies & local storage" id="cookies">
          Everion stores session tokens and preferences in browser local storage. Analytics fire
          only after consent. No advertising cookies, no cross-site tracking.
        </Section>

        <Separator className="my-12" />
        <div
          className="f-serif"
          style={{ fontSize: 14, fontStyle: "italic", color: "var(--ink-faint)" }}
        >
          last touched 29 April 2026. write to{" "}
          <a href="mailto:stander.christian@gmail.com" style={{ color: "var(--ember)" }}>
            stander.christian@gmail.com
          </a>{" "}
          if anything here isn't clear.
        </div>
      </article>
    </div>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ marginBottom: 40, scrollMarginTop: 24 }}>
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
