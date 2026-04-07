export interface QueuedOperation { type:"create"|"update"|"delete"; entry_id: string; payload: Record<string,unknown>; }
export function enqueue(q: QueuedOperation[], op: QueuedOperation): void { q.push(op); }
export function dequeue(q: QueuedOperation[]): QueuedOperation | undefined { return q.shift(); }
export function peekQueue(q: QueuedOperation[]): QueuedOperation | undefined { return q[0]; }
