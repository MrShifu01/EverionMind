const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * ARCH-7: Centralized auth middleware.
 * Wraps a handler with Supabase JWT auth verification.
 * Adds req.user (user ID string) if auth passes.
 * Returns 401 if no valid token present.
 *
 * Usage:
 *   export default withAuth(async function handler(req, res) {
 *     const userId = req.user; // guaranteed to be set
 *     ...
 *   });
 */
export function withAuth(handler) {
  return async (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Unauthorized' });

    const userData = await userRes.json();
    req.user = userData.id;
    return handler(req, res);
  };
}
