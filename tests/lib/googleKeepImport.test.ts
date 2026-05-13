import { describe, expect, it, vi } from "vitest";
import { parseGoogleKeep } from "../../src/lib/imports/google-keep";

describe("Google Keep import", () => {
  it("marks imported notes as needing AI parse/classification", async () => {
    const file = new File(
      [
        JSON.stringify({
          title: "Renew driver's licence",
          textContent: "Licence ABC123 expires 2027-05-01",
          createdTimestampUsec: 1_700_000_000_000_000,
        }),
      ],
      "licence.json",
      { type: "application/json" },
    );

    const entries = await parseGoogleKeep([file], vi.fn(), new AbortController().signal);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.type).toBe("note");
    expect(entries[0]?.metadata.import_source).toBe("google_keep");
    expect(entries[0]?.metadata.enrichment).toEqual({ parsed: false });
  });
});
