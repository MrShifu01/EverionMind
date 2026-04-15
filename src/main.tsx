import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SpeedInsights } from "@vercel/speed-insights/react";
import * as Sentry from "@sentry/react";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./ThemeContext";
import ErrorBoundary from "./ErrorBoundary";
import PrivacyPolicy from "./views/PrivacyPolicy";

Sentry.init({
  dsn: "https://6e5d222a07dc7a0eb057d0572920045f@o4511133135470592.ingest.us.sentry.io/4511133136846848",
  sendDefaultPii: false,
});

// When a new service worker takes control (after skipWaiting), reload so the
// fresh chunks are served instead of the stale cached ones.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

const isPrivacy = window.location.pathname === "/privacy";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        {isPrivacy ? <PrivacyPolicy /> : <><App /><SpeedInsights /></>}
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
