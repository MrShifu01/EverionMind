const KEY = (id: string) => `openbrain_chat_history_${id}`;
export interface Turn { role: "user"|"assistant"; content: string; }
export function getHistory(brainId: string): Turn[] {
  try { return JSON.parse(sessionStorage.getItem(KEY(brainId)) || "[]"); } catch { return []; }
}
export function addTurn(brainId: string, role: "user"|"assistant", content: string): void {
  const h = getHistory(brainId);
  h.push({ role, content });
  sessionStorage.setItem(KEY(brainId), JSON.stringify(h.slice(-40)));
}
export function clearHistory(brainId: string): void { sessionStorage.removeItem(KEY(brainId)); }
export function trimHistory(history: Turn[], maxMessages: number): Turn[] { return history.slice(-maxMessages); }
