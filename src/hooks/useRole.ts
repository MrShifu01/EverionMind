import type { Brain, RolePermissions } from "../types";

export function useRole(brain: Brain | null | undefined): RolePermissions {
  const role = brain?.myRole ?? "viewer";
  return {
    canWrite: role === "owner" || role === "member",
    canInvite: role === "owner",
    canDelete: role === "owner" || role === "member",
    canManageMembers: role === "owner",
    role,
  };
}
