const SB_URL = "https://wfvoqpdfzkqnenzjxhui.supabase.co";

export async function verifyAuth(req) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return null;

  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return null;
  return res.json();
}
