/**
 * Single source of truth for the current user's email cached in localStorage.
 *
 * Several places need to know the email synchronously during render — the
 * admin chip gate on every EntryCard, the email shown in the sidebar, the
 * sign-out flow. Going through supabase.auth.getUser() in those paths costs
 * an async call per render, so SettingsView writes the email here once on
 * load and the cheap sync readers all consume it.
 *
 * Centralising the read/write lets every call site share one key spelling
 * and one try/catch — easier to audit and impossible to typo "everion_email"
 * differently across files.
 */

const KEY = "everion_email";

export function getCachedEmail(): string {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setCachedEmail(email: string | null | undefined): void {
  try {
    if (email && email.length > 0) {
      localStorage.setItem(KEY, email);
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    // localStorage may throw in private mode or with disk-full — silent here
    // because the cache is a perf optimisation, never a correctness gate.
  }
}

/**
 * Compare the cached email against an expected admin email. Returns false
 * when adminEmail is empty (no admin configured) so admin features stay
 * locked off in environments without VITE_ADMIN_EMAIL set.
 */
export function isCachedAdmin(adminEmail: string): boolean {
  if (!adminEmail) return false;
  return getCachedEmail() === adminEmail;
}
