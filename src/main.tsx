import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { SpeedInsights } from "@vercel/speed-insights/react";
import * as Sentry from "@sentry/react";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./ThemeContext";
import ErrorBoundary from "./ErrorBoundary";
import PrivacyPolicy from "./views/PrivacyPolicy";
import TermsOfService from "./views/TermsOfService";
import { ConsentBanner, getConsentDecision } from "./components/ConsentBanner";

function initSentry() {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    enabled: !!import.meta.env.VITE_SENTRY_DSN,
    sendDefaultPii: false,
  });
}

// Init immediately if user already consented in a previous session
if (getConsentDecision() === "accepted") initSentry();

// When a new service worker takes control (after skipWaiting), reload so the
// fresh chunks are served instead of the stale cached ones.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

const pathname = window.location.pathname;

function Root() {
  const [consent, setConsent] = useState(() => getConsentDecision());

  function handleDecision(decision: "accepted" | "declined") {
    if (decision === "accepted") initSentry();
    setConsent(decision);
  }

  if (pathname === "/privacy") return <PrivacyPolicy />;
  if (pathname === "/terms") return <TermsOfService />;

  return (
    <>
      <App />
      {consent === "accepted" && <SpeedInsights />}
      {consent === null && <ConsentBanner onDecision={handleDecision} />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
