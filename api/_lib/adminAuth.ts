import type { AuthedUser } from "./withAuth.js";

export function isAdminUser(user: Pick<AuthedUser, "app_metadata">): boolean {
  return user.app_metadata?.is_admin === true;
}
