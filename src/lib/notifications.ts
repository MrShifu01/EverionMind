import type { ToastEvent, ToastListener } from '../types';

const listeners = new Set<ToastListener>();

export function showToast(message: string, type: ToastEvent['type'] = 'info'): void {
  listeners.forEach(fn => fn({ message, type, id: Date.now() }));
}

export function showError(message: string): void { showToast(message, 'error'); }
export function showSuccess(message: string): void { showToast(message, 'success'); }

export function onToast(callback: ToastListener): () => void {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

export function captureError(err: unknown, context: string = ''): void {
  console.error(`[OpenBrain:${context}]`, err);
}
