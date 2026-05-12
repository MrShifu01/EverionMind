import { describe, expect, it } from "vitest";
import { extractFactsFromProseCandidates } from "../../api/_lib/factExtraction";

describe("factExtraction prose candidates", () => {
  it("promotes only high-confidence durable prose facts", () => {
    const facts = extractFactsFromProseCandidates(
      {
        id: "entry-1",
        title: "Sarah",
        type: "note",
        metadata: null,
      },
      [
        {
          title: "Birthday",
          summary: "Sarah's birthday is July 4.",
          memory_type: "fact",
          confidence: 0.97,
        },
        {
          title: "Possible restaurant",
          summary: "Sarah may like Bistro 47.",
          memory_type: "preference",
          confidence: 0.6,
        },
      ],
    );

    expect(facts).toEqual([
      {
        memory_key: "fact:sarah_birthday",
        memory_type: "fact",
        title: "Sarah — Birthday",
        summary: "Sarah's birthday is July 4.",
        source_entry_ids: ["entry-1"],
      },
    ]);
  });

  it("does not promote prose facts from private or collection-shaped entries", () => {
    const candidate = {
      title: "PIN",
      summary: "The PIN is 1234.",
      memory_type: "fact",
      confidence: 0.99,
    };

    expect(
      extractFactsFromProseCandidates(
        { id: "entry-1", title: "Vault", type: "secret", metadata: null },
        [candidate],
      ),
    ).toEqual([]);
    expect(
      extractFactsFromProseCandidates(
        { id: "entry-2", title: "Shopping", type: "list", metadata: null },
        [candidate],
      ),
    ).toEqual([]);
  });
});
