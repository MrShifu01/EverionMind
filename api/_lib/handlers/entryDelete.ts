import { ApiError, requireBrainRole, type HandlerContext } from "../withAuth.js";
import { bodyObject } from "../requestBody.js";
import { sbHeaders, sbHeadersNoContent } from "../sbHeaders.js";
import { writeAuditLog } from "../auditLog.js";

const SB_URL = process.env.SUPABASE_URL;

interface EntryDeleteDeps {
  stripDeletedFromConceptGraph: (brainId: string, entryId: string) => Promise<void>;
}

export async function handleDeleteEntry(
  { req, res, user, req_id, log }: HandlerContext,
  deps: EntryDeleteDeps,
): Promise<void> {
  const { id } = bodyObject(req.body);
  if (!id || typeof id !== "string" || id.length > 100) {
    throw new ApiError(400, "Missing or invalid id");
  }

  const permanent = req.query.permanent === "true";
  const entryRes = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id`,
    { headers: sbHeadersNoContent() },
  );
  if (!entryRes.ok) throw new ApiError(502, "Database error");
  const [entry]: any[] = await entryRes.json();
  if (!entry) throw new ApiError(404, "Not found");

  await requireBrainRole(user.id, entry.brain_id, permanent ? ["owner"] : ["owner", "member"]);

  if (permanent) {
    const response = await fetch(
      `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(entry.brain_id)}`,
      { method: "DELETE", headers: sbHeaders({ Prefer: "return=minimal" }) },
    );
    log.info("entry hard delete", { entry_id: id, ok: response.ok });

    if (response.ok) {
      deps.stripDeletedFromConceptGraph(entry.brain_id, id).catch((err: any) =>
        console.error("[delete:concept-graph]", err?.message ?? err),
      );

      writeAuditLog({
        userId: user.id,
        action: "entry_permanent_delete",
        resourceId: id,
        requestId: req_id,
      });
    }

    res.status(response.ok ? 200 : 502).json({ ok: response.ok });
    return;
  }

  const response = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&brain_id=eq.${encodeURIComponent(entry.brain_id)}`,
    {
      method: "PATCH",
      headers: sbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    },
  );
  log.info("entry soft delete", { entry_id: id, ok: response.ok });

  if (response.ok) {
    writeAuditLog({
      userId: user.id,
      action: "entry_delete",
      resourceId: id,
      requestId: req_id,
    });
  }

  res.status(response.ok ? 200 : 502).json({ ok: response.ok });
}
