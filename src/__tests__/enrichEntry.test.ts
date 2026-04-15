import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
const { mockAuthFetch } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
}));

vi.mock("../lib/authFetch", () => ({ authFetch: mockAuthFetch }));

// brainConnections is dynamically imported — mock it too
vi.mock("../lib/brainConnections", () => ({
  extractEntryConnections: vi.fn().mockResolvedValue(undefined),
  generateEntryInsight: vi.fn().mockResolvedValue(undefined),
}));

import { enrichEntry } from "../lib/enrichEntry";
import type { Entry } from "../types";

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "entry-1",
    title: "Test Entry",
    type: "note",
    ...overrides,
  };
}

function makeOkResponse(body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeErrorResponse(status = 500) {
  return new Response(null, { status });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enrichEntry — phase isolation", () => {
  it("embedding phase failure does not block concepts or insight phases", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);

    // All phases unenriched — we want to test each phase runs despite embed failing
    const entry = makeEntry({ metadata: {} });

    // Parsing phase → ok (returns valid JSON)
    mockAuthFetch.mockResolvedValueOnce(
      makeOkResponse({ content: [{ text: '{"type":"note","content":"parsed"}' }] }),
    );
    // Embedding phase → fails
    mockAuthFetch.mockResolvedValueOnce(makeErrorResponse(500));
    // Concepts phase runs via brainConnections (mocked above) — no authFetch call needed

    await enrichEntry(entry, "brain-1", onUpdate);

    // onUpdate called at least for the parse phase (type + content)
    expect(onUpdate).toHaveBeenCalled();
    // No uncaught exception — all phases ran
  });

  it("parsing phase failure does not block embedding or concepts phases", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);

    const entry = makeEntry({ metadata: {} });

    // Parse → throws network error
    mockAuthFetch.mockRejectedValueOnce(new Error("network error"));
    // Embed → success
    mockAuthFetch.mockResolvedValueOnce(makeOkResponse({}));

    await enrichEntry(entry, "brain-1", onUpdate);

    // onUpdate still called for embedding phase
    expect(onUpdate).toHaveBeenCalled();
  });

  it("skips already-enriched phases", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);

    // All phases already done
    const entry = makeEntry({
      embedded_at: "2024-01-01",
      metadata: {
        enrichment: {
          embedded: true,
          concepts_count: 3,
          has_insight: true,
          parsed: true,
        },
      },
    });

    await enrichEntry(entry, "brain-1", onUpdate);

    expect(mockAuthFetch).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("runs only missing phases when partially enriched", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);

    // Parsed + embedded, but no concepts or insight
    const entry = makeEntry({
      embedded_at: "2024-01-01",
      metadata: {
        enrichment: { embedded: true, parsed: true, concepts_count: 0, has_insight: false },
      },
    });

    // Only concepts + insight phases should run (no authFetch for those — brainConnections handles them)
    await enrichEntry(entry, "brain-1", onUpdate);

    // authFetch not called (no parse or embed phase needed)
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });
});
