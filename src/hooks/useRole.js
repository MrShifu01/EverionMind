/**
 * useRole — derive permission flags from a brain's myRole field.
 *
 * Usage:
 *   const { canWrite, canInvite, canManageMembers, role } = useRole(activeBrain);
 */
export function useRole(brain) {
  const role = brain?.myRole ?? "viewer";
  return {
    canWrite: role === "owner" || role === "member",
    canInvite: role === "owner",
    canDelete: role === "owner" || role === "member",
    canManageMembers: role === "owner",
    role,
  };
}
