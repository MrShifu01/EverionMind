import AdminTab from "../components/settings/AdminTab";

export default function AdminView() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--color-background, #0e0e0e)",
        color: "var(--ink, #f0ede6)",
        fontFamily: "var(--f-sans)",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 36 }}>
          <a
            href="/"
            style={{
              fontSize: 13,
              color: "var(--ink-faint, #888)",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            ← Back to app
          </a>
          <h1
            className="f-serif"
            style={{ fontSize: 28, fontWeight: 450, margin: 0, letterSpacing: "-0.015em" }}
          >
            Admin
          </h1>
        </div>
        <AdminTab />
      </div>
    </div>
  );
}
