# Architecture Deepening Audit — 2026-05-07

> Friction-driven exploration to surface **module-deepening** refactor candidates.
> Based on John Ousterhout's *A Philosophy of Software Design* — deep modules have small interfaces hiding large implementations. Deep modules are testable at the boundary, navigable by AI agents, and resilient to change.
>
> **This is a discovery audit, not a remediation plan.** Findings here become RFCs once a candidate is picked. Security-grade gaps surfaced incidentally are linked to the existing production-hardening audit, not duplicated.

## Scope

Four parallel exploration passes:

1. `api/` — serverless handler topology, cross-cutting concerns, dispatch dispatch patterns.
2. `src/` — React component sprawl, hook depth, view↔Supabase coupling.
3. `api/_lib/` AI/provider/embedding layer — provider abstraction, retrieval pipeline, quota gates.
4. Auth/security/vault — auth wrappers, vault crypto isolation, recovery state machine.

## Resolution Status — 2026-05-07

High-confidence fixes implemented now:

- [x] **LLM provider gate, phase 1** — `callAI()` now accepts metered user context and consumes quota before provider network calls. Merge preview now uses that boundary instead of only doing a read-only quota peek. Gemini request-body creation and answer-text extraction were consolidated into `api/_lib/providers/geminiHelpers.ts`, shared by both `api/_lib/aiProvider.ts` and `api/_lib/providers/gemini.ts`.
- [x] **Route boundary, phase 1** — `withAuth()` and `withApiKey()` now share a route-start/error boundary for security headers, cache headers, request IDs, method checks, route-limit normalization, and consistent unhandled-error responses. This reduces duplicated cross-cutting route boilerplate without adding Vercel functions.
- [x] **Boundary tests** — added `tests/api/ai-provider-boundary.test.ts` to prove denied quota blocks provider calls and the shared Gemini parser ignores thought parts.

Deferred and intentionally still unchecked:

- [ ] **Full LLM boundary migration** — direct `googleAiFetch()` generation paths still exist in Gmail/persona distillation, persona extraction, Gmail scan, feedback, and retrieval. These should be migrated in small batches because some are embeddings/model-listing paths and some use fallback-model behavior that needs preserved semantics.
- [ ] **Full `withRoute({ auth, rateLimit, headers, dispatch })` API** — phase 1 extracted the shared boundary inside `withAuth.ts`; the next step is a public/data-driven route wrapper and endpoint-by-endpoint adoption.
- [ ] **Resource dispatch extraction** — `api/user-data.ts`, `api/entries.ts`, and `api/mcp.ts` still need internal handler-module extraction under `api/_lib/handlers/` without adding top-level Vercel functions.
- [ ] **Vault security orchestrator** — still needs an RFC and test-first implementation because it changes PIN/biometric/recovery state ownership.
- [ ] **Vault ops hook split** — should wait until the orchestrator exists so the split has a stable state-machine boundary.
- [ ] **Capture pipeline split** — should wait until the LLM boundary migration is complete enough that capture can depend on one AI interface.
- [ ] **ProfileTab decomposition** — useful maintainability work, but lower production-risk priority than the route, LLM, and vault work.

## Friction map (raw signal)

### A. Handler god-routers

| File | LOC | Sub-actions | Dispatch shape |
|---|---|---|---|
| `api/user-data.ts` | 3,441 | 29 (`?resource=`) | Manual if-else chain L99–146; handler funcs co-located in same file from L1196+ |
| `api/entries.ts` | 1,665 | 24 (`?action=`) | Manual if-chain L79–117 inside `withAuth` closure; mostly inline lambdas |
| `api/v1.ts` | 396 | 6 (`?action=`) | Data-driven `HANDLERS` map L357 — clean pattern |
| `api/mcp.ts` | 838 | OAuth + 6 tool calls | Custom branching, bypasses `withAuth` |

**Constraint**: Vercel Hobby plan = 12 functions max. Project sits at exactly 12. New endpoints must consolidate into existing handlers. Extracting per-resource files breaks the budget; extracting per-resource modules into `api/_lib/handlers/` does not.

**Why it hurts**: AI agents (and humans) opening `user-data.ts` face a 3,441-line file. The hobby-plan constraint is not the cause — the lack of a data-driven dispatch table + per-resource module pattern is.

### B. Cross-cutting concerns inconsistent

- `withAuth` used by entries, capture, feedback. **Skipped** by user-data, memory-api, mcp.
- `applySecurityHeaders` called manually 6× across files including ones already wrapped in `withAuth`.
- Rate-limit: sometimes via `withAuth({ rateLimit })` opt, sometimes inline `rateLimit()` call (memory-api L49, L89), sometimes nested inside sub-handlers (user-data).
- `sbHeaders()` invoked by every Supabase-touching handler — explicit but repeated everywhere.

**Refactor signal**: A single `withRoute({ auth, rateLimit, headers, dispatch })` boundary would replace ~400 lines of boilerplate across 12 files and make every endpoint go through one gate.

### C. Provider/Gemini path duplication

Three independent paths to Gemini, each reimplementing the payload shape (`contents`, `systemInstruction`, `generationConfig`) and answer-text extraction:

1. `api/_lib/googleAi.ts` — bare URL+fetch builder. Used by embeddings, distillation, retrieval.
2. `api/_lib/providers/gemini.ts` — full ProviderAdapter (completion, chatStep, appendToolResult).
3. `api/_lib/aiProvider.ts::callGemini` (L216–269) — one-shot for enrichment.

`pickAnswerText()` logic duplicated in `providers/gemini.ts:22–35` and `aiProvider.ts:253–268`.

**Refactor signal**: Extract a shared Gemini payload builder + response parser into `_lib/providers/gemini-helpers.ts`; make all three paths consume it. Removes ~50 lines of duplication, single source of truth for Gemini wire shape.

### D. Quota gate not at LLM boundary

`enrichQuota.checkAndConsumeQuota` called from **one place**: `enrich.ts::enrichInline()`. Other LLM call sites bypass quota:

- `mergeEntries.ts` calls `callAI()` directly without quota check.
- `distillGmail.ts`, `distillRejected.ts`, `extractPersonaFacts.ts` call Gemini via `googleAiFetch()` directly — no quota gate.

**Refactor signal**: Move quota check inside `callAI()` itself. Every LLM dispatch goes through the same gate. Closes a token-runaway risk and makes cost control consistent.

### E. Frontend god components

| Component | LOC | Tests | Concerns bundled |
|---|---|---|---|
| `ProfileTab.tsx` | 2,328 | 0 | persona CRUD + living memory grid + pinning + history timeline + fading section |
| `AdminTab.tsx` | 1,898 | 0 | feature flags + admin prefs + test runners + Gmail debug + CRM panel + mock review |
| `CaptureSheet.tsx` | 1,005 | 0 | form state + file parsing + AI classification + vault branch + voice modal + secret detection |
| `GmailSyncTab.tsx` | 988 | 0 | Gmail OAuth + staged inbox + pattern rules + scan debug + review modal |

**Hooks**:
- `useVaultOps.ts` (962 LOC, 0 tests) — full vault unlock + PIN/biometric + recovery + envelope encryption + decryption + bulk actions. Returns 25+ destructured fields. Crypto keys held in refs (good). Untested.
- `useCaptureSheetParse.ts` (813 LOC, 0 tests) — file parsing + extraction + AI classification + preview + secret detection + offline queue.

**Refactor signal**: Two distinct candidates here:
1. **Split god components** along bounded contexts (ProfileTab → ProfileCore + PersonaFactsGrid; CaptureSheet → tab bodies).
2. **Split god hooks** along orthogonal concerns (`useVaultOps` → `useVaultSetup` + `useVaultUnlock` + `useVaultDecrypt` + `useVaultActions`).

### F. Vault recovery state machine has no orchestrator

Files involved in PIN / biometric / recovery-key:
- `src/lib/crypto.ts` — master encrypt/decrypt, recovery key gen/wrap/unwrap.
- `src/lib/vaultPinKey.ts` — PIN/biometric AES wrapping, localStorage persistence.
- `src/components/vault/VaultPinSetup.tsx` — PIN enrollment UI.
- `src/components/settings/SecurityTab.tsx` — PIN management UI.
- `src/components/vault/VaultRevealModal.tsx` — receives entry + key as props; **no wrapper enforces `entry.type === "secret"` before rendering**.

No single owner validates the full state machine (master → PIN-wrap → biometric-wrap → recovery-key-backed-up). Tests cover crypto roundtrips but **not the end-to-end unlock flow**.

**Refactor signal**: A `VaultSecurityOrchestrator` (deep module) hiding the state machine behind a small interface (`isUnlocked`, `unlock(strategy)`, `setupPin(pin)`, `rotateRecoveryKey()`, `lock()`). UI components subscribe; library code is the single source of truth for state transitions.

### G. Authorization gaps (security overlap — see existing audit)

`checkBrainAccess` not consistently called. Security-relevant findings already tracked in `audit-production-hardening-2026-05-06.md` (P0-2, P0-3). Not duplicated here. Architectural read: authorization is a **leaky concern** — every handler must remember to call `checkBrainAccess` with the right scope. A deep `withBrainScope({ entry|brain|grant })` boundary would force the check at the route layer.

### H. Test coverage gaps

- API handlers untested: `gmail.ts`, `mcp.ts`, `calendar.ts`, `feedback.ts`, `transfer.ts`, `memory-api.ts`.
- Provider dispatch (`callAI`, retry logic, all four adapters) untested — only `llm.test.ts` exists for transcribe.
- Quota gate (`enrichQuota`) untested.
- Distillation (distillGmail, distillRejected, extractPersonaFacts) untested.
- Frontend god components: zero tests on 4 components totaling ~6,200 LOC.

### I. Cycles

**None detected**. `personalBrain.ts` is a leaf. `generateEmbedding.ts` is a leaf. `aiProvider.ts → googleAi.ts` is unidirectional. `retrievalCore.ts → generateEmbedding.ts` is unidirectional. The four-tier dependency graph is acyclic.

## Candidate deepening targets (ranked by leverage)

Each candidate is a **module to deepen** — small interface, large hidden implementation, replaceable boundary tests for many existing inside-the-box tests.

| # | Candidate | Cluster | Dependency category | Test impact |
|---|---|---|---|---|
| 1 | **Route boundary** (`withRoute`) | `_lib/withAuth.ts` + every `api/*.ts` + `sbHeaders` + rateLimit + applySecurityHeaders | Cross-cutting concern (port) | Replaces 12 handler-level integration tests with 1 boundary test + per-action contract tests |
| 2 | **Resource dispatch** (data-driven handlers in `api/_lib/handlers/`) | `user-data.ts`, `entries.ts`, `mcp.ts` | Domain core | Each sub-resource gets its own unit test; god-router file becomes a dispatch table |
| 3 | **Vault security orchestrator** | `crypto.ts` + `vaultPinKey.ts` + setup/unlock/PIN/biometric/recovery UI components | Domain core (security-critical) | Unlock state machine becomes testable in isolation; UI components shrink to dumb subscribers |
| 4 | **LLM provider gate** (`callAI` becomes the universal LLM boundary) | `aiProvider.ts` + `googleAi.ts` + `providers/gemini.ts` + every distillation file + `enrichQuota.ts` + `mergeEntries.ts` | Cross-cutting concern (port) | One fake provider replaces 8 fetch mocks; quota tested at one boundary |
| 5 | **Vault ops hook split** (`useVaultOps` → 4 focused hooks) | `useVaultOps.ts` + every component that consumes it | UI/state | Each hook independently testable; components stop unpacking 25-field objects |
| 6 | **Capture pipeline** (`useCaptureSheetParse` → `useFileExtraction` + `useAIClassification` + `useSecretDetection`) | `useCaptureSheetParse.ts` + `CaptureSheet.tsx` | UI/state | File parsing testable without LLM; AI classification testable without file I/O |
| 7 | **ProfileTab decomposition** | `ProfileTab.tsx` + persona-related libs | UI domain | Persona facts grid becomes a standalone module with own state and tests |

## Why these and not others

Skipped:
- **Provider abstraction** itself — already deep and clean (one finding only: payload duplication, captured in #4).
- **Retrieval core pipeline** — already a clean unidirectional flow.
- **Distillation pipeline** — correct microservice decomposition; not split for the wrong reason.
- **EntriesContext / BrainContext** — already focused, single-responsibility.
- **Modal/dialog primitives** — unified on shadcn/radix; no inconsistency.
- **Authorization (brain access)** — security gaps tracked in production-hardening audit; the *architectural* form of this finding is candidate #1 (`withRoute` could host the brain-scope check).

## Next step

User picks one candidate. The picked candidate gets:
1. A user-facing problem-space brief (constraints, dependencies, illustrative sketch).
2. 3+ parallel sub-agent design proposals with radically different interface shapes.
3. Side-by-side comparison + opinionated recommendation.
4. RFC saved to this folder (or a follow-up audit, since user override redirects from GitHub issues to EML/Audits).

---

**Audit kicked off by**: `/Improve-architecture save findings in eml audits` on 2026-05-07.
**Method**: 4 parallel `Explore` sub-agents with friction-driven prompts. No fixed checklist.
**Verification**: file paths, line counts, and import patterns above were sampled directly from the working tree on 2026-05-07. No claims pulled from training memory.
