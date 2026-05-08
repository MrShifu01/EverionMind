import { sbHeaders } from "./sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;

interface AuditLogInput {
  userId: string;
  action: string;
  resourceId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function writeAuditLog(input: AuditLogInput): void {
  const body: Record<string, unknown> = {
    user_id: input.userId,
    action: input.action,
    resource_id: input.resourceId ?? null,
    request_id: input.requestId ?? null,
    timestamp: new Date().toISOString(),
  };
  if (input.metadata) body.metadata = input.metadata;

  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(body),
  })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text().catch(() => "<unable to read response body>");
        console.error(
          `[audit_log] write failed for ${input.action}: status=${response.status}, body=${text}`,
        );
      }
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[audit_log] write failed for ${input.action}: ${msg}`);
    });
}
