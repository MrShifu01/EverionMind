import type { Entry } from "../types";

export function extractPhone(entry: Entry): string | null {
  const s = JSON.stringify(entry.metadata || {}) + " " + (entry.content || "");
  const m = s.match(/(\+27|0)[6-8][0-9]{8}/);
  return m ? m[0] : null;
}

export function toWaUrl(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.startsWith("0") ? "27" + d.slice(1) : d}`;
}
