import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";

// Bundle visualizer — opt-in via `BUNDLE_STATS=1 npm run build`. Emits
// dist/stats.html (treemap + sunburst, gzip + brotli sizes). Off by default
// so normal builds don't write 1 MB of HTML into the deploy artefact.
const bundleStatsEnabled = process.env.BUNDLE_STATS === "1";

// Sentry source-map upload only runs when ALL three env vars are present.
// In Vercel: add SENTRY_AUTH_TOKEN (Sentry → Settings → Auth Tokens, scope
// project:write), SENTRY_ORG (slug), and SENTRY_PROJECT (slug). Without
// them the plugin is a no-op so local + preview builds keep working.
const sentryEnabled = !!(
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT
);

export default defineConfig({
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, "./src") }],
  },
  server: {
    proxy: {
      "/api": {
        target: "https://everion.smashburgerbar.co.za",
        changeOrigin: true,
      },
    },
  },
  build: {
    // Heavy import/parsing tools are lazy-route chunks. Keep the warning
    // threshold aligned with that intentional architecture so build output
    // still flags truly accidental >1 MB chunks.
    chunkSizeWarningLimit: 1000,
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => !dep.includes("sentry-"));
      },
    },
    // Sentry needs source maps to symbolicate stack traces. We emit them
    // and let the plugin upload + delete after upload so they don't ship
    // to the public bundle.
    sourcemap: sentryEnabled ? true : false,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/@supabase/")) return "supabase";
          if (id.includes("/node_modules/@sentry/")) return "sentry";
          // Group radix-ui primitives into one vendor chunk. Without this each
          // primitive (dialog, popover, tabs, select, ...) ends up in its own
          // micro-chunk — ~15 separate dist-*.js requests on first paint, each
          // < 5 KB. One ~80 KB chunk gzips better and saves the per-request
          // HTTP/2 stream overhead. radix is used both eagerly (Tooltip,
          // Toaster) and lazily (Dialog inside DetailModal); putting it in a
          // shared chunk means lazy paths reuse the eager download.
          if (id.includes("/node_modules/@radix-ui/")) return "radix";
          // lucide-react fans out into per-icon chunks otherwise. Single chunk
          // is cheaper than 8 separate icon-bundle requests.
          if (id.includes("/node_modules/lucide-react/")) return "lucide";
          // posthog-js is consent + idle-deferred (see main.tsx deferSdks).
          // Pinning to its own chunk keeps the deferred fetch from accidentally
          // pulling in unrelated vendor code via cross-chunk imports.
          if (id.includes("/node_modules/posthog-js/")) return "posthog";
          // pdfjs/mammoth/exceljs/jszip are dynamically imported in
          // fileExtract.ts. Letting Vite auto-chunk them keeps small shared
          // utilities out of the eagerly-modulepreloaded set — manual chunking
          // these would pin shared utility modules into a "named" chunk that
          // the entry statically pulls (~120 KB gzip pdfjs preload regression
          // we saw in the bundle audit).
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    bundleStatsEnabled &&
      visualizer({
        filename: "dist/stats.html",
        gzipSize: true,
        brotliSize: true,
        template: "treemap",
        title: "Everion bundle stats",
      }),
    sentryEnabled &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        // Strip source maps from the public bundle after upload. Stack
        // traces remain readable inside Sentry; visitors can't fetch them.
        sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
        telemetry: false,
      }),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "prompt",
      // We register the SW ourselves via UpdatePrompt.tsx so we can gate on
      // Capacitor.isNativePlatform() — service workers inside the Capacitor
      // WebView have a long history of pain (cache mismatches, ghost SWs
      // surviving app upgrades). Default 'auto' would inject an unconditional
      // <script> in index.html that registers before our gate can run.
      injectRegister: false,
      manifest: {
        name: "Everion",
        short_name: "Everion",
        description: "Chris's personal memory & knowledge OS",
        theme_color: "#211a14",
        background_color: "#211a14",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      injectManifest: {
        // webp added 2026-04-30 — `/logoNew.webp` was 404'ing offline (used
        // by the LoadingScreen splash and the inline boot shell), showing
        // the broken-image glyph in airplane mode.
        globPatterns: ["**/*.{js,css,ico,png,svg,webp}"],
        // Exclude heavy lazy chunks from the precache. These are
        // dynamic-imported only when a user actually uses the feature
        // (PDF capture, .xlsx import, GraphView, AdminTab). Including
        // them would force a 3+ MB background download on every first
        // visit — punishing cellular users for features they may never
        // open. Workbox falls back to network on demand for these.
        // Sentry is consent-gated; precaching it would download the SDK
        // even for users who decline analytics.
        globIgnores: [
          "**/exceljs.min-*.{js,mjs}",
          "**/pdf-*.{js,mjs}",
          "**/pdf.worker-*.{js,mjs}",
          "**/jszip.min-*.{js,mjs}",
          "**/nlpParser-*.{js,mjs}",
          "**/AdminTab-*.{js,mjs}",
          "**/GraphView-*.{js,mjs}",
          "**/sentry-*.{js,mjs}",
          "**/LoginScreen-*.{js,mjs}",
          "**/StatusPage-*.{js,mjs}",
          "**/ResetPasswordView-*.{js,mjs}",
          "**/BearImportPanel-*.{js,mjs}",
          "**/EvernoteImportPanel-*.{js,mjs}",
          "**/GoogleKeepImportPanel-*.{js,mjs}",
          "**/NotionImportPanel-*.{js,mjs}",
          "**/ObsidianImportPanel-*.{js,mjs}",
          "**/ReadwiseImportPanel-*.{js,mjs}",
          "**/VaultRevealModal-*.{js,mjs}",
          "**/ChatView-*.{js,mjs}",
        ],
        // Vite-pwa's default cap is 2 MB — pdf.worker is 2.2 MB raw, which
        // would warn even after we ignore it. Dropping the limit slightly
        // is fine because the ignored set is now under any one-file cap.
        maximumFileSizeToCacheInBytes: 1_500_000,
      },
    }),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test-setup.ts",
    exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**", "**/.claude/**", "**/e2e/**"],
  },
});
