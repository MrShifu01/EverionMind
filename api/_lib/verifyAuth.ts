import type { ApiRequest } from './types';

const SB_URL = process.env.SUPABASE_URL;

export async function verifyAuth(req: ApiRequest): Promise<any> {
  const token = (req.headers.authorization as string | undefined)?.split(" ")[1];
  if (!token) return null;

  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return null;
  return res.json();
}
