/**
 * POST /api/embed — standalone entry point that delegates to capture's handleEmbed.
 * Kept as a separate file so existing imports (tests, rewrites) continue to work.
 */
export { handleEmbed as default } from "./capture.js";
