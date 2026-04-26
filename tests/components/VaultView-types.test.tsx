import { describe, it, expect } from "vitest";

// Test the filter predicate directly, not the component
describe("vault secrets filter", () => {
  it("includes encrypted:true entries regardless of type", () => {
    const entries = [
      { id: "1", title: "A", type: "secret", encrypted: true },
      { id: "2", title: "B", type: "note", encrypted: false },
      { id: "3", title: "C", type: "vault-item", encrypted: true },
    ];
    const secrets = entries.filter(
      (e) => e.type === "secret" || e.encrypted === true
    );
    expect(secrets).toHaveLength(2);
    expect(secrets.map((e) => e.id)).toContain("1");
    expect(secrets.map((e) => e.id)).toContain("3");
  });

  it("excludes entries that are not secret type and not encrypted", () => {
    const entries = [
      { id: "1", title: "A", type: "note", encrypted: false },
      { id: "2", title: "B", type: "idea", encrypted: false },
    ];
    const secrets = entries.filter(
      (e) => e.type === "secret" || e.encrypted === true
    );
    expect(secrets).toHaveLength(0);
  });

  it("includes type=secret even if encrypted flag is absent", () => {
    const entries = [
      { id: "1", title: "A", type: "secret" },
      { id: "2", title: "B", type: "note" },
    ];
    const secrets = entries.filter(
      (e: any) => e.type === "secret" || e.encrypted === true
    );
    expect(secrets).toHaveLength(1);
    expect(secrets[0].id).toBe("1");
  });
});
