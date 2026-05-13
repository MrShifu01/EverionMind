import { describe, expect, it } from "vitest";
import {
  deriveCaptureKind,
  normalizeCaptureTypeForStorage,
  parseCaptureResults,
} from "../../api/_lib/enrich";
import { flagsOf } from "../../api/_lib/enrichFlags";

describe("enrichment capture classification", () => {
  it("maps UI capture categories to storage-safe entry types", () => {
    expect(normalizeCaptureTypeForStorage("memory")).toBe("note");
    expect(normalizeCaptureTypeForStorage("vault")).toBe("secret");
    expect(normalizeCaptureTypeForStorage("web article")).toBe("article");
    expect(normalizeCaptureTypeForStorage("URL")).toBe("article");
  });

  it("derives the first-step capture kind from type and metadata", () => {
    expect(deriveCaptureKind("secret")).toBe("vault");
    expect(deriveCaptureKind("list")).toBe("list");
    expect(deriveCaptureKind("article")).toBe("article");
    expect(deriveCaptureKind("note", { renewal_date: "2027-05-01" })).toBe("reminder");
    expect(deriveCaptureKind("note", { cellphone: "082 111 2222" })).toBe("contact");
    expect(deriveCaptureKind("document")).toBe("memory");
  });

  it("preserves split entries from the capture model response", () => {
    const entries = parseCaptureResults(
      JSON.stringify([
        {
          title: "Driver licence details",
          type: "document",
          content: "Licence number ABC123.",
          metadata: { capture_kind: "memory" },
          tags: ["licence"],
        },
        {
          title: "Renew driver licence",
          type: "reminder",
          content: "Renew the licence before expiry.",
          metadata: { renewal_date: "2027-05-01", capture_kind: "reminder" },
          tags: ["renewal"],
        },
      ]),
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]?.type).toBe("document");
    expect(entries[1]?.metadata?.renewal_date).toBe("2027-05-01");
  });

  it("treats old imported notes without capture_kind as still needing parse", () => {
    expect(
      flagsOf({
        type: "note",
        metadata: {
          import_source: "google_keep",
          enrichment: { parsed: true, has_insight: true, concepts_extracted: true },
        },
        embedding_status: "done",
      }).parsed,
    ).toBe(false);

    expect(
      flagsOf({
        type: "note",
        metadata: {
          import_source: "google_keep",
          capture_kind: "memory",
          enrichment: { parsed: true, has_insight: true, concepts_extracted: true },
        },
        embedding_status: "done",
      }).parsed,
    ).toBe(true);
  });
});
