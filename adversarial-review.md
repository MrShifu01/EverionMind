# OpenBrain Scaling Sprint — Critical Summary

## Core Principle

**OpenBrain is NOT chat.** It's a system that maintains a continuous, evolving model of a user's mind. All engineering decisions must reinforce this invariant.

---

## Target Architecture

```
Client (UI)
    ↓
Brain API (Authority Layer)
    ↓
Brain Kernel
    ↓
Memory System
    ↓
Model Providers
```

**Critical Rule:** Only the Brain Kernel mutates cognition.

---

## 7-Phase Execution Plan

### Phase 1: Brain Authority (Foundational)
- **Goal:** Single source of truth for cognition
- **Architect decides:** Brain definition, cognition mutations, invariants
- **Code executes:** Move all memory writes into `/brain` module, block direct DB writes, add `validateBrainAccess()`
- **Done when:** UI cannot directly change database cognition

### Phase 2: Memory Types (Anti-Entropy)
- **Taxonomy:** episodic, semantic, goals, plans, beliefs, reflections
- **Code executes:** Typed memory schema, `memory_type` enum, retrieval filters
- **Done when:** Memory queries never mix incompatible cognition types

### Phase 3: Brain Isolation (1 → 1,000)
- **Goal:** Guarantee zero cross-brain contamination
- **Code executes:** Row-level security, `brain_id` required on ALL tables, isolation tests
- **Done when:** Cross-brain access impossible even with malformed requests

### Phase 4: Schema Versioning (Future-Proofing)
- **Philosophy:** Brains migrate forward, never rewrite history
- **Code executes:** `brain_schema_version`, migration runner, compatibility adapters
- **Done when:** Old brains run on new code safely

### Phase 5: Event-Driven Cognition (1M Brains Enabled)
- **Core events:** THOUGHT_CREATED, MEMORY_STORED, PLAN_UPDATED, REFLECTION_TRIGGERED
- **Code executes:** Event bus, async workers, queue long reasoning tasks
- **Done when:** Brain actions no longer block user requests

### Phase 6: Reflection Loop (Intelligence Multiplier)
- **Goal:** Brains improve themselves
- **Code executes:** Reflection worker, periodic scheduling, self-analysis storage
- **Done when:** Brains generate self-analysis automatically

### Phase 7: Model Abstraction (Provider Independence)
- **Goal:** Prevent vendor lock-in
- **Code executes:** Provider interface, adapters (OpenRouter, Claude, future), brain calls capability not model
- **Done when:** Switching models requires zero brain changes

---

## Scaling Checkpoints

| Stage | Requirement |
|-------|------------|
| 1 Brain | Deterministic state |
| 1,000 Brains | Strict isolation |
| 100,000 Brains | Async cognition |
| 1,000,000 Brains | Event-driven architecture |

---

## Claude Code Automation Boundaries

**Claude Code MAY:**
- Refactor internal modules
- Enforce typing
- Add tests
- Migrate schemas
- Improve performance

**Claude Code MAY NOT:**
- Redefine cognition model
- Change brain invariants
- Alter memory taxonomy
- Introduce new authority layers

---

## Success Metrics
- Brain load time < 200ms metadata fetch
- Memory retrieval deterministic
- Zero cross-user reads
- Schema upgrades non-breaking
- Reflection loop operational

---

## Final Invariant

**OpenBrain scales when:** Adding a new brain is creating data, not creating complexity.

*If adding users requires new logic, architecture has failed.*
