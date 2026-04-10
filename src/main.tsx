import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SpeedInsights } from "@vercel/speed-insights/react";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./ThemeContext";
import ErrorBoundary from "./ErrorBoundary";

// When a new service worker takes control (after skipWaiting), reload so the
// fresh chunks are served instead of the stale cached ones.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
        <SpeedInsights />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
