import { withAuth, ApiError, type HandlerContext } from "./_lib/withAuth.js";
import { sbHeaders } from "./_lib/sbHeaders.js";

const SB_URL = process.env.SUPABASE_URL!;

export default withAuth(
  { methods: ["GET", "PATCH", "DELETE"], cacheControl: "no-store" },
  async (ctx) => {
    const method = ctx.req.method;
    if (method === "GET")    return handleList(ctx);
    if (method === "PATCH")  return handleUpdate(ctx);
    if (method === "DELETE") return handleDismissAll(ctx);
    throw new ApiError(405, "Method not allowed");
  },
);

async function handleList({ req, res, user }: HandlerContext) {
  const dismissed = req.query.dismissed === "true" ? "eq.true" : "eq.false";
  const r = await fetch(
    `${SB_URL}/rest/v1/notifications?user_id=eq.${encodeURIComponent(user.id)}&dismissed=${dismissed}&order=created_at.desc&limit=50`,
    { headers: sbHeaders() },
  );
  if (!r.ok) throw new ApiError(502, "Failed to fetch notifications");
  const rows = await r.json();
  res.json(rows);
}

async function handleUpdate({ req, res, user }: HandlerContext) {
  const { id, read, dismissed } = req.body as { id: string; read?: boolean; dismissed?: boolean };
  if (!id) throw new ApiError(400, "Missing id");
  const patch: Record<string, unknown> = {};
  if (read !== undefined)      patch.read = read;
  if (dismissed !== undefined) patch.dismissed = dismissed;
  if (!Object.keys(patch).length) throw new ApiError(400, "Nothing to update");
  const r = await fetch(
    `${SB_URL}/rest/v1/notifications?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
    { method: "PATCH", headers: sbHeaders({ Prefer: "return=minimal" }), body: JSON.stringify(patch) },
  );
  if (!r.ok) throw new ApiError(502, "Failed to update notification");
  res.json({ ok: true });
}

async function handleDismissAll({ res, user }: HandlerContext) {
  await fetch(
    `${SB_URL}/rest/v1/notifications?user_id=eq.${encodeURIComponent(user.id)}&dismissed=eq.false`,
    { method: "PATCH", headers: sbHeaders({ Prefer: "return=minimal" }), body: JSON.stringify({ dismissed: true }) },
  );
  res.json({ ok: true });
}
