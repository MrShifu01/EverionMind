# Sprint: Graphify-Inspired Upgrades

**Branch:** `graphify-upgrades`
**Source:** `future-plans/graphify-research.md`

---

## Phase 1 — Confidence Labels on AI Analysis (P0)

**Goal:** Every AI-generated field shows EXTRACTED / INFERRED / AMBIGUOUS so users know what was found vs guessed.

### Tasks

- [x] **1.1** Add `confidence` field to Entry type — `Record<string, "extracted" | "inferred" | "ambiguous">` mapping each AI-populated field to its confidence level
- [x] **1.2** Update `PROMPTS.COMBINED_AUDIT` in `src/config/prompts.ts` to instruct Gemini to return confidence labels alongside every suggestion (type changes, tag additions, link suggestions, gap detections)
- [x] **1.3** Update `useRefineAnalysis.ts` to parse and store confidence labels from AI response on each suggestion
- [x] **1.4** Update capture flow (`/api/capture.ts` + `PROMPTS.CAPTURE`) to return confidence per extracted field (type, tags, metadata)
- [x] **1.5** Store confidence map in `entry.metadata.confidence` via EntryRepository
- [x] **1.6** Add confidence badges to UI:
  - RefineView suggestion cards — small pill showing confidence level per suggestion
  - DetailModal — subtle indicator next to AI-populated fields
  - EntryList cards — optional confidence dot on type badge
- [x] **1.7** Color scheme: green = extracted (explicit in user input), amber = inferred (AI deduced), red-outline = ambiguous (uncertain, verify)

**Files touched:**
- `src/types.ts` — Entry/EntryMetadata interface
- `src/config/prompts.ts` — CAPTURE, COMBINED_AUDIT prompts
- `src/hooks/useRefineAnalysis.ts` — Parse confidence from AI
- `src/hooks/useCaptureSheetParse.ts` — Parse confidence on capture
- `api/capture.ts` — Return confidence in response
- `src/views/RefineView.tsx` — Confidence pills on suggestions
- `src/views/DetailModal.tsx` — Confidence indicators on fields
- `src/components/EntryList.tsx` — Optional confidence dot

---

## Phase 2 — Concept Extraction in Refine (P1)

**Goal:** Extract concepts and relationships from entries during refine analysis, building a lightweight knowledge graph per brain.

### Tasks

- [x] **2.1** Define concept/relationship schema:
  ```typescript
  interface Concept {
    id: string;
    label: string;
    source_entries: string[];  // entry IDs where this concept appears
    frequency: number;
  }
  interface Relationship {
    source_concept: string;
    target_concept: string;
    relation: string;          // "related_to", "depends_on", "part_of", etc.
    confidence: "extracted" | "inferred";
    confidence_score: number;  // 0.0-1.0
    evidence_entries: string[];
  }
  ```
- [x] **2.2** Add concept extraction to `PROMPTS.COMBINED_AUDIT` — instruct Gemini to identify key concepts per entry and relationships between entries
- [x] **2.3** Create `src/lib/conceptGraph.ts`:
  - `extractConcepts(entries, aiResponse)` — parse AI output into Concept[]
  - `extractRelationships(entries, aiResponse)` — parse into Relationship[]
  - `mergeGraph(existing, new)` — deduplicate concepts by normalized label
  - `getConceptsForEntry(entryId)` — lookup
- [x] **2.4** Store concept graph in Supabase: `brain_concepts` and `brain_relationships` tables (or as JSON blob in brain metadata for MVP)
- [x] **2.5** Update `useRefineAnalysis.ts` to call concept extraction after audit, store results
- [x] **2.6** Add "Related Entries" section to DetailModal — show entries that share concepts with the current entry
- [x] **2.7** Add concept tags to EntryList — small concept pills below existing tags showing AI-discovered concepts

**Files touched:**
- `src/types.ts` — Concept, Relationship interfaces
- `src/lib/conceptGraph.ts` — New file
- `src/config/prompts.ts` — COMBINED_AUDIT additions
- `src/hooks/useRefineAnalysis.ts` — Trigger concept extraction
- `src/views/DetailModal.tsx` — Related entries section
- `src/components/EntryList.tsx` — Concept pills
- API/Supabase — Storage for concept graph

---

## Phase 3 — Surprising Connections (P1)

**Goal:** Surface non-obvious relationships between entries that users wouldn't find on their own.

### Tasks

- [x] **3.1** Create `src/lib/surpriseScore.ts` — composite scoring algorithm:
  - Cross-type bonus: entries of different types connected = +2
  - Cross-workspace bonus: business entry linked to personal = +2
  - Low-overlap bonus: entries sharing 0 tags but connected by concept = +3
  - Peripheral-to-hub: low-connection entry links to high-connection entry = +1
  - Confidence weight: inferred connections score higher surprise than extracted
- [x] **3.2** Add `findSurprisingConnections(concepts, relationships, entries)` function — returns top 5 ranked surprises with `why` explanation string
- [x] **3.3** Add surprise prompt to `PROMPTS.COMBINED_AUDIT` — ask Gemini to identify unexpected conceptual links between entries and explain why they're surprising
- [x] **3.4** Create `src/components/SurprisingConnections.tsx` — card component showing:
  - Entry A <-> Entry B connection
  - Surprise reason ("These entries both discuss X but from completely different angles")
  - Confidence indicator
  - "Explore" action to open both entries
- [x] **3.5** Add Surprising Connections section to RefineView — show after main suggestions
- [x] **3.6** Add to SuggestionsView as a "Discovery" category

**Files touched:**
- `src/lib/surpriseScore.ts` — New file
- `src/config/prompts.ts` — Surprise detection prompt
- `src/components/SurprisingConnections.tsx` — New component
- `src/views/RefineView.tsx` — Discovery section
- `src/views/SuggestionsView.tsx` — Discovery category
- `src/hooks/useRefineAnalysis.ts` — Trigger surprise detection

---

## Phase 4 — Key Concepts / God Nodes (P2)

**Goal:** Show users the most connected ideas in their brain — "What are the core themes of your knowledge?"

### Tasks

- [x] **4.1** Add `getGodNodes(concepts, relationships)` to `conceptGraph.ts` — return top N concepts by degree (number of relationships), filtering out generic hubs like "note" or "task"
- [x] **4.2** Create `src/components/KeyConcepts.tsx` — visual display of top 5-10 concepts:
  - Concept label + connection count
  - List of entries that reference this concept
  - Tap to filter EntryList by concept
- [x] **4.3** Add Key Concepts section to brain overview (above EntryList or in a collapsible header)
- [x] **4.4** Use key concepts to enhance system prompt in `systemPromptBuilder.ts` — "This brain's core themes are: X, Y, Z" for better AI context

**Files touched:**
- `src/lib/conceptGraph.ts` — getGodNodes()
- `src/components/KeyConcepts.tsx` — New component
- `src/OpenBrain.tsx` or `src/views/` — Placement in brain view
- `src/lib/systemPromptBuilder.ts` — Inject key concepts

---

## Phase 5 — Interactive Graph Visualization (P2)

**Goal:** Visual map of vault entries and their relationships — the "wow" feature.

### Tasks

- [x] **5.1** Install graph visualization library (options: `react-force-graph-2d`, `@react-sigma/core`, or `vis-network` — recommend `react-force-graph-2d` for React integration + performance)
- [x] **5.2** Create `src/views/GraphView.tsx`:
  - Nodes = entries (sized by connection count, colored by type)
  - Edges = relationships from concept graph (thickness = confidence score)
  - Cluster coloring by detected communities
  - Click node to open DetailModal
  - Search/filter by type, tag, concept
- [x] **5.3** Add community detection — simple algorithm: group entries sharing 3+ concepts, or use label propagation from the concept graph
- [x] **5.4** Add Graph tab to BottomNav / DesktopSidebar navigation
- [x] **5.5** Mobile-responsive: pinch zoom, tap to select, swipe to pan
- [x] **5.6** Performance: virtualize for 500+ nodes, lazy-load edge details

**Files touched:**
- `package.json` — New dependency
- `src/views/GraphView.tsx` — New file
- `src/components/BottomNav.tsx` — New nav item
- `src/components/DesktopSidebar.tsx` — New nav item
- `src/components/icons/NavIcons.tsx` — Graph icon
- `src/App.tsx` — Route registration

---

## Phase 6 — Automatic Clustering (P3)

**Goal:** Auto-organize entries into conceptual groups beyond manual tags.

### Tasks

- [x] **6.1** Implement label propagation or simple community detection in `conceptGraph.ts` using the relationship graph
- [x] **6.2** Assign cluster IDs to entries, store in `entry.metadata.cluster`
- [x] **6.3** Add cluster filter to GridFilters — "View by cluster: [Theme A] [Theme B] [Theme C]"
- [x] **6.4** Auto-name clusters using the dominant concept in each group
- [x] **6.5** Show cluster cohesion score (how tightly related entries are within the cluster)

**Files touched:**
- `src/lib/conceptGraph.ts` — Community detection
- `src/components/GridFilters.tsx` — Cluster filter
- `src/hooks/useRefineAnalysis.ts` — Trigger clustering

---

## Phase 7 — Feedback Loop (P3)

**Goal:** User interactions strengthen the knowledge graph over time.

### Tasks

- [x] **7.1** Track which connections users accept/dismiss in refine — feed into relationship confidence scores
- [x] **7.2** Track search queries and chat topics — extract concepts from user questions
- [x] **7.3** When user manually links entries, create extracted-confidence relationships
- [x] **7.4** Periodically rebuild concept graph incorporating feedback signals
- [x] **7.5** Update `learningEngine.ts` to include graph feedback alongside existing accept/reject tracking

**Files touched:**
- `src/lib/conceptGraph.ts` — Feedback integration
- `src/lib/learningEngine.ts` — Graph signals
- `src/hooks/useRefineAnalysis.ts` — Track accept/dismiss on connections
- `src/hooks/useChat.ts` — Extract concepts from queries

---

## Implementation Notes

- **Phase 1 is standalone** — can ship independently, no graph dependency
- **Phases 2-3 are coupled** — concept graph enables surprising connections
- **Phase 4 builds on 2** — god nodes need the concept graph
- **Phase 5 builds on 2+4** — visualization needs graph data + clusters
- **Phases 6-7 are incremental** — enhance existing graph infrastructure

**AI cost consideration:** Concept extraction adds ~200-400 tokens to each refine AI call. Surprising connections add ~100 tokens. Both fit within existing single-call pattern — no additional API calls needed.

**Storage consideration:** Concept graph for a 500-entry brain ≈ 50-200 concepts, 100-500 relationships ≈ ~50KB JSON. Can start as brain metadata blob, move to dedicated tables if needed.
