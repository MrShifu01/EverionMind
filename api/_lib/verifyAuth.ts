import type { ApiRequest } from './types';
import type { AuthedUser } from './withAuth.js';

const SB_URL = process.env.SUPABASE_URL;

export async function verifyAuth(req: ApiRequest): Promise<AuthedUser | null> {
  const token = (req.headers.authorization as string | undefined)?.split(" ")[1];
  if (!token) return null;

  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return null;
  return (await res.json()) as AuthedUser;
}
