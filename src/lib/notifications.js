/**
 * ARCH-13: Unified toast/notification system — module-level singleton.
 * No React context provider required. Components subscribe via onToast().
 *
 * Usage:
 *   import { showError, showSuccess, onToast } from './lib/notifications';
 *
 *   // Emit a notification (from anywhere, including non-React code):
 *   showError('Save failed: network error');
 *   showSuccess('Entry saved!');
 *
 *   // Listen in a component:
 *   useEffect(() => onToast(({ message, type, id }) => { ... }), []);
 */

const listeners = new Set();

export function showToast(message, type = 'info') {
  listeners.forEach(fn => fn({ message, type, id: Date.now() }));
}

export function showError(message) { showToast(message, 'error'); }
export function showSuccess(message) { showToast(message, 'success'); }

/**
 * Register a listener for toast events.
 * @param {function} callback - called with { message, type, id }
 * @returns {function} cleanup — call to unsubscribe
 */
export function onToast(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * ARCH-10: Centralized error handler.
 * Replace with Sentry.captureException(err) when monitoring is provisioned.
 */
export function captureError(err, context = '') {
  console.error(`[OpenBrain:${context}]`, err);
  // TODO: Sentry.captureException(err, { extra: { context } });
}
