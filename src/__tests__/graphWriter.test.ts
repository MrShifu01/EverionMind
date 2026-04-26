import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
const { mockLoadGraphFromDB, mockSaveGraphToDB, mockMergeGraph, mockValidateGraph } = vi.hoisted(
  () => ({
    mockLoadGraphFromDB: vi.fn(),
    mockSaveGraphToDB: vi.fn(),
    mockMergeGraph: vi.fn(),
    mockValidateGraph: vi.fn(),
  }),
);

vi.mock("../lib/conceptGraph", () => ({
  loadGraphFromDB: mockLoadGraphFromDB,
  saveGraphToDB: mockSaveGraphToDB,
  mergeGraph: mockMergeGraph,
  validateGraph: mockValidateGraph,
}));

import { writeConceptsToGraph } from "../lib/graphWriter";
import type { ConceptGraph } from "../lib/conceptGraph";

const EMPTY: ConceptGraph = { version: 2, concepts: [], relationships: [] };
const GRAPH_A: ConceptGraph = {
  version: 2,
  concepts: [{ id: "a", label: "Alpha", source_entries: ["e1"], frequency: 1 }],
  relationships: [],
};
const GRAPH_B: ConceptGraph = {
  version: 2,
  concepts: [{ id: "b", label: "Beta", source_entries: ["e2"], frequency: 1 }],
  relationships: [],
};
const MERGED: ConceptGraph = {
  version: 2,
  concepts: [...GRAPH_A.concepts, ...GRAPH_B.concepts],
  relationships: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateGraph.mockReturnValue(true);
  mockMergeGraph.mockReturnValue(MERGED);
});

describe("writeConceptsToGraph — serialization", () => {
  it("two concurrent calls for the same brainId queue: second waits for first", async () => {
    const callOrder: number[] = [];

    // First load resolves after a delay; second resolves immediately
    mockLoadGraphFromDB
      .mockImplementationOnce(async () => {
        await new Promise<void>((r) => setTimeout(r, 20));
        callOrder.push(1);
        return EMPTY;
      })
      .mockImplementationOnce(async () => {
        callOrder.push(2);
        return MERGED;
      });

    mockSaveGraphToDB.mockResolvedValue(undefined);

    const p1 = writeConceptsToGraph("brain-1", GRAPH_A);
    const p2 = writeConceptsToGraph("brain-1", GRAPH_B);

    await Promise.all([p1, p2]);

    // Load must have been called in order, never overlapping
    expect(callOrder).toEqual([1, 2]);
    expect(mockLoadGraphFromDB).toHaveBeenCalledTimes(2);
    expect(mockSaveGraphToDB).toHaveBeenCalledTimes(2);
  });

  it("two concurrent calls for different brainIds run independently", async () => {
    const callOrder: string[] = [];

    mockLoadGraphFromDB
      .mockImplementationOnce(async () => {
        await new Promise<void>((r) => setTimeout(r, 20));
        callOrder.push("brain-X");
        return EMPTY;
      })
      .mockImplementationOnce(async () => {
        callOrder.push("brain-Y");
        return EMPTY;
      });

    mockSaveGraphToDB.mockResolvedValue(undefined);

    await Promise.all([
      writeConceptsToGraph("brain-X", GRAPH_A),
      writeConceptsToGraph("brain-Y", GRAPH_B),
    ]);

    // brain-Y completes before brain-X finishes its delayed load
    expect(callOrder).toEqual(["brain-Y", "brain-X"]);
  });
});

describe("writeConceptsToGraph — validation", () => {
  it("aborts write if incoming graph is invalid", async () => {
    mockValidateGraph.mockReturnValue(false);

    await writeConceptsToGraph("brain-1", { concepts: null as unknown as [], relationships: [] });

    expect(mockLoadGraphFromDB).not.toHaveBeenCalled();
    expect(mockSaveGraphToDB).not.toHaveBeenCalled();
  });
});
