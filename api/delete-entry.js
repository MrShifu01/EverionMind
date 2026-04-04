import { rateLimit } from "./_lib/rateLimit.js";
import { withAuth } from "./_lib/withAuth.js";

const SB_URL = process.env.SUPABASE_URL;

export default withAuth(async function handler(req, res) {
  if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed" });
  if (!(await rateLimit(req, 30))) return res.status(429).json({ error: "Too many requests" });

  // req.user is set by withAuth middleware
  const user = { id: req.user };

  const { id } = req.body;
  if (!id || typeof id !== "string" || id.length > 100) {
    return res.status(400).json({ error: "Missing or invalid id" });
  }

  // SEC-1: Verify the requesting user is a member of this entry's brain
  const entryRes = await fetch(`${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}&select=brain_id`, {
    headers: {
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!entryRes.ok) return res.status(502).json({ error: "Database error" });
  const [entry] = await entryRes.json();
  if (!entry) return res.status(404).json({ error: "Not found" });

  const memberRes = await fetch(
    `${SB_URL}/rest/v1/brain_members?brain_id=eq.${encodeURIComponent(entry.brain_id)}&user_id=eq.${encodeURIComponent(user.id)}&select=role`,
    {
      headers: {
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!memberRes.ok) return res.status(502).json({ error: "Database error" });
  const [member] = await memberRes.json();
  if (!member) return res.status(403).json({ error: "Forbidden" });

  const response = await fetch(
    `${SB_URL}/rest/v1/entries?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );

  console.log(`[audit] DELETE entry id=${id} user=${user.id} ok=${response.ok}`);

  // SEC-14: Fire-and-forget audit log write to Supabase
  fetch(`${SB_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      user_id: user.id,
      action: 'entry_delete',
      resource_id: id,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {}); // best-effort, never blocks

  res.status(response.ok ? 200 : 502).json({ ok: response.ok });
});
