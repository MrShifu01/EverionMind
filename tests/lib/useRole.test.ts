import { describe, it, expect } from "vitest";
import { useRole } from "../../src/hooks/useRole";
import type { Brain, RolePermissions } from "../../src/types";

describe("useRole", () => {
  it("returns owner permissions for owner role", () => {
    const brain: Brain = { id: "1", name: "Test", myRole: "owner" };
    const result: RolePermissions = useRole(brain);
    expect(result.canWrite).toBe(true);
    expect(result.canInvite).toBe(true);
    expect(result.canDelete).toBe(true);
    expect(result.canManageMembers).toBe(true);
    expect(result.role).toBe("owner");
  });

  it("returns member permissions for member role", () => {
    const brain: Brain = { id: "2", name: "Test", myRole: "member" };
    const result: RolePermissions = useRole(brain);
    expect(result.canWrite).toBe(true);
    expect(result.canInvite).toBe(false);
    expect(result.canDelete).toBe(true);
    expect(result.canManageMembers).toBe(false);
    expect(result.role).toBe("member");
  });

  it("returns viewer permissions by default", () => {
    const brain: Brain = { id: "3", name: "Test" };
    const result: RolePermissions = useRole(brain);
    expect(result.canWrite).toBe(false);
    expect(result.canInvite).toBe(false);
    expect(result.canDelete).toBe(false);
    expect(result.canManageMembers).toBe(false);
    expect(result.role).toBe("viewer");
  });

  it("handles null brain", () => {
    const result: RolePermissions = useRole(null);
    expect(result.role).toBe("viewer");
  });
});
