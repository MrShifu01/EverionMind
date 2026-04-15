import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SpeedInsights } from "@vercel/speed-insights/react";
import * as Sentry from "@sentry/react";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./ThemeContext";
import ErrorBoundary from "./ErrorBoundary";
import PrivacyPolicy from "./views/PrivacyPolicy";
import TermsOfService from "./views/TermsOfService";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  sendDefaultPii: false,
});

// When a new service worker takes control (after skipWaiting), reload so the
// fresh chunks are served instead of the stale cached ones.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

const pathname = window.location.pathname;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        {pathname === "/privacy" ? (
          <PrivacyPolicy />
        ) : pathname === "/terms" ? (
          <TermsOfService />
        ) : (
          <><App /><SpeedInsights /></>
        )}
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
