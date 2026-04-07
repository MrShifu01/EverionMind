export class RLSViolationError extends Error { constructor(msg = "RLS violation") { super(msg); this.name = "RLSViolationError"; } }
export function assertBrainOwnership(requestingUserId: string, ownerUserId: string): void {
  if (requestingUserId !== ownerUserId) throw new RLSViolationError(`User ${requestingUserId} does not own this brain`);
}
