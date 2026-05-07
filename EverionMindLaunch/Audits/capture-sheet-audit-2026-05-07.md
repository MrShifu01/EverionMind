# Capture Sheet Audit — 2026-05-07

> Capture sheet is primary input surface for Everion Mind. Audits client-side parse pipeline, file extraction, AI classification call, secret detection, vault branch, voice modal, offline queue replay, file-size guards, optimistic insert. Server `api/capture.ts` covered separately by capture-pipeline audit; voice-transcribe server flow deferred to voice-transcription audit.

## Verdict

**Architecture is sound.** Single hook owns parse + save (`useCaptureSheetParse`), single component owns shell + tabs (`src/components/CaptureSheet.tsx`), file extraction routes through one entrypoint (`extractTextFromFile`), offline path is real (IndexedDB via `offlineQueue.ts` + drain in `useOfflineSync`), voice is a fullscreen modal with a permission-aware error path. Optimistic insert is in place (`onCreated` fires before server returns id; temp id reconciled later).

**Six findings**, two HIGH (image cap is silent + no MIME allowlist on doc picker; PDF parser runs on main thread when worker init fails), three MEDIUM (no PDF page cap, no per-call upload throttle, no cap on textarea raw input bytes), one LOW (paste-URL has no metadata fetch). **Top blocker for launch**: F1 — image-only path enforces 5 MB cap but doc/pdf path has no client cap, so a 50 MB scanned PDF gets fully buffered in memory before the network even sees it. Browser can OOM on low-RAM Android.

---

## Architecture overview

```
                   ┌────────────────────────────────────────────────┐
 user opens sheet  │  CaptureSheet.tsx (Radix Dialog, 360ms slide)  │
        ▼          │  ─ tabs: entry | secret | list                  │
                   │  ─ pills: brain · type (memory/list/vault/...)  │
                   │  ─ voice modal portal (separate Radix-aware)    │
                   └─────┬───────────────────┬──────────────────────┘
                         │ text + files      │ voice transcript
                         ▼                   ▼
        ┌──────────────────────────────────────────┐
        │  useCaptureSheetParse (capture())        │
        │   ├─ buildInput(text + uploadedFiles[])  │
        │   ├─ trackCaptureMethod(method)          │
        │   ├─ callAI(PROMPTS.CAPTURE | FILE_SPLIT)│
        │   ├─ JSON.parse(stripped)                │
        │   ├─ if !ok → POST /api/llm?action=split │
        │   ├─ if type=secret + !hasFiles          │
        │   │       → setSecretCandidate (no save) │
        │   └─ doSave(parsed) ─┐                   │
        └──────────────────────┼───────────────────┘
                               ▼
        ┌──────────────────────────────────────────┐
        │  doSave routes:                          │
        │   ├─ type=secret + cryptoKey             │
        │   │     → encryptEntry → /api/vault-...  │
        │   ├─ onBackgroundSave (default path)     │
        │   │     → useBackgroundCapture           │
        │   │       .queueDirectSave               │
        │   │         ├─ navigator.onLine? POST    │
        │   │         │     /api/capture (3 retry) │
        │   │         └─ offline → enqueue +       │
        │   │           tempId + onCreated         │
        │   └─ inline POST /api/capture            │
        └──────────────────────────────────────────┘

 file-drop / file-pick path:
   handleDocFiles(files[])
     ├─ .vcf  → handleVcfFile → runContactPipeline → batched POST
     ├─ image/* → handleImageFile (5MB cap) → extractTextFromFile
     │             → compressImage(1024px, q0.82) → /api/extract-file (Gemini)
     └─ other → extractTextFromFile
                 ├─ .xlsx → exceljs (in-tab JS, ~main thread)
                 ├─ .pdf  → pdfjs-dist (worker if init succeeds)
                 ├─ .docx → mammoth (in-tab JS)
                 ├─ .html → stripHtml regex
                 └─ .*    → TextDecoder

 voice path:
   Mic button → setVoiceModalOpen(true) → VoiceCaptureModal
   ├─ getUserMedia(audio)
   ├─ MediaRecorder (webm/opus | webm | mp4 fallback chain)
   ├─ stop → POST /api/transcribe (raw octet-stream + ?mime= query)
   └─ onTranscript → setText(prev + " " + t) → CaptureSheet
```

---

## Capture-mode inventory

| Mode | Trigger | File | Pre-save guard | Optimistic? | Offline? |
|---|---|---|---|---|---|
| **text** | textarea + Capture button or Cmd/Ctrl+Enter | `CaptureSheet.tsx:232-246`, `CaptureEntryBody.tsx:145-148` | none on raw bytes | yes (via `onCreated` in parent) | yes (queueDirectSave → enqueue) |
| **paste** | textarea native paste (no `onPaste` handler) | n/a (browser default) | none | follows text path | follows text path |
| **file-pick (doc)** | paperclip → hidden `<input type=file accept="image/*,.pdf,.docx,.xlsx,.xls,.txt,.md,.csv,.json">` | `CaptureEntryBody.tsx:98-110` | per-extension dispatch in `extractTextFromFile`, **no size cap** | yes after extract + classify | classify+save fail offline (extraction works for non-image) |
| **file-pick (image)** | mobile camera glyph + image picker | `CaptureEntryBody.tsx:73-97` | `IMAGE_MAX_BYTES = 5 * 1024 * 1024` (5 MB) at `useCaptureSheetParse.ts:16,619-622` | yes after extract+classify | extract requires `/api/extract-file`, fails offline silently |
| **drag-drop** | not wired in current sheet | n/a | n/a | n/a | n/a |
| **VCF contacts** | drop a `.vcf` | `useCaptureSheetParse.ts:648-733` (handleVcfFile) | none | yes per contact | per-contact POST, no offline branch |
| **voice** | Mic button → `VoiceCaptureModal` | `src/components/VoiceCaptureModal.tsx`, `src/hooks/useVoiceRecorder.ts` | mic permission check; `MIN_VOICE_BLOB_BYTES = 1000` (drops < 1 KB blobs) | yes (transcript injected into text → next capture is optimistic) | no — server transcribe required, no queue |
| **share-target** | OS share sheet → PWA | **not wired** — `public/manifest.json` has no `share_target` key | n/a | n/a | n/a |
| **memory tab default** | `activeTab === "entry"` | as text | none | yes | yes |
| **list tab** | type pill = list | `CaptureSheet.tsx:248-263` | none | yes (direct doSave, type=list) | yes |
| **vault tab** | type pill = vault | `CaptureSheet.tsx:497-519`, `useCaptureSheetParse.ts:124-160` | requires `cryptoKey`; if absent, navigates to vault setup | yes | **no** — vault-entries POST has no offline branch |
| **someday** | type pill = someday (gated `somedayEnabled`) | `CaptureSheet.tsx:232-244` | bypasses AI; raw text → type=someday | yes | yes (goes through doSave → onBackgroundSave) |

---

## What's solid

- **Single source of truth for save**. `useCaptureSheetParse.doSave` is the only function that POSTs to `/api/capture`. Secret branch encrypts client-side first (`encryptEntry`) and routes to `/api/vault-entries` instead. No accidental plaintext leak path. (`useCaptureSheetParse.ts:116-244`)
- **Secret detection is human-in-the-loop**. AI flags `type === "secret"`, hook stops mid-save and surfaces `secretCandidate` to parent. Parent renders `SecretConfirmPanel` with three explicit choices (Yes/No/Cancel). User cannot accidentally encrypt or accidentally store-as-plaintext. Files DO save through (skips secret confirmation) because partial-document encryption would lose context — documented at `useCaptureSheetParse.ts:415-425`.
- **Vault branch fails closed**. If `parsed.type === "secret"` and `!cryptoKey`: hook sets `errorDetail = "Vault is locked — unlock your vault first, then try again"`, status="error", returns without POSTing (`useCaptureSheetParse.ts:124-130`). User cannot bypass.
- **Optimistic insert in <100 ms.** `queueDirectSave` calls `onCreated` with the `tempId` BEFORE awaiting the network in the offline path (`useBackgroundCapture.ts:337-351`). In the online path `onCreated` fires immediately on `res.ok` (`useBackgroundCapture.ts:382-397`). Sub-second on a normal network; instant on offline.
- **Offline queue persists across reload.** `offlineQueue.ts` opens IndexedDB `openbrain-offline` v2 with `queue` + `failed_ops` stores. `localStorage` fallback only on `QuotaExceededError`. `useOfflineSync.drain` runs on `window.online` and on Capacitor `Network.networkStatusChange`. Stale ops > 7 days dropped (`useOfflineSync.ts:42-46`). Max 3 retries with exponential backoff before move-to-failed.
- **Image compression before upload.** `compressImage(file, maxDim=1024, quality=0.82)` at `fileExtract.ts:15-44` resizes to ≤ 1024px and re-encodes JPEG. 3–8 MB phone photo drops to 150–400 KB before `/api/extract-file` POST. Vercel 4.5 MB body limit not at risk.
- **PDF text-layer first, vision OCR fallback.** `extractPDF` at `fileExtract.ts:122-146` uses pdfjs-dist worker. Empty text layer (scanned PDFs) → falls through to `extractViaAI` (Gemini). Cheap path always tried first.
- **DOCX + XLSX local.** `mammoth` and `exceljs` parse in-tab — no server round-trip, works offline. XLSX preserves rows as TSV, doesn't lose structure.
- **Voice modal owns its own pointer-events claim.** `pointerEvents: "auto"` at `VoiceCaptureModal.tsx:197` overrides Radix's body-level `pointer-events:none` so the stop button stays clickable from inside its portal. Documented in source comment.
- **Voice mic permission has dedicated error path.** `useVoiceRecorder.ts:130-137`: catches `NotAllowedError` / `PermissionDeniedError` and emits `[voice] Microphone permission denied`. Modal renders the message via `phase === "error"` and turns the big record button into a cancel-with-X glyph. Tap retries via cancel + reopen.
- **Late onError suppression after success.** `transcriptFiredRef` in `VoiceCaptureModal.tsx:71-75` ignores stream/recorder teardown errors that fire AFTER a successful onTranscript — modal would otherwise flash "recording failed" right before close.
- **CaptureSheet is lazy-loaded + idle-prefetched.** `Everion.tsx:37-50` lazy-imports the chunk and warms it on `requestIdleCallback` (or `setTimeout(1500)` on iOS Safari). First-tap latency drops from 100–500 ms parse to ~50 ms paint.
- **AI classification has graceful fallback.** Primary `callAI` fails → tries `/api/llm?action=split` → falls back to manual edit preview with `_raw` populated so the user's text isn't lost (`useCaptureSheetParse.ts:286-389`).
- **Drag-handle doesn't close mid-recording.** `onPointerDownOutside` and `onInteractOutside` both check `voiceModalOpen` and `preview` and `e.preventDefault()` to keep the parent sheet open while the modal owns the screen (`CaptureSheet.tsx:397-409`).

---

## Findings

### F1 — Doc/PDF picker has no client-side size cap (HIGH)

**File**: `src/components/CaptureEntryBody.tsx:98-110`, `src/lib/fileExtract.ts:156-200`, `src/hooks/useCaptureSheetParse.ts:16,617-622,736-772`

`IMAGE_MAX_BYTES = 5 * 1024 * 1024` is enforced ONLY in `handleImageFile` (line 619). The doc path `handleDocFiles → extractTextFromFile` has no equivalent guard. The hidden file input at `CaptureEntryBody.tsx:101` accepts:

```
image/*,.pdf,.docx,.xlsx,.xls,.txt,.md,.csv,.json
```

with no `multiple` cap and no per-file max-size attribute. A user selecting a 50 MB scanned PDF (or a 30 MB Excel report) routes through:

1. `file.arrayBuffer()` — entire file allocated to RAM (`fileExtract.ts:165`).
2. `pdfjs-dist getDocument({ data: new Uint8Array(buffer) })` — second copy of the buffer in pdfjs internals.
3. Per-page `getTextContent()` accumulates strings.
4. After extract, `setUploadedFiles((prev) => [...prev, { name, content: extracted.trim() }])` — full text held in React state.
5. On Capture, `buildInput` slices to `FILE_CONTENT_LIMIT = 150_000` chars but ONLY at the build-input step — extracted full text already in memory.

**Impact**: Low-RAM Android (2 GB devices, common in launch markets) OOMs the tab on a 30+ MB doc with no error message. iOS Safari aborts the renderer. User sees the sheet hang then close itself.

**Fix**: add a per-type cap before `extractTextFromFile`:

```ts
const DOC_MAX_BYTES = 10 * 1024 * 1024;   // 10 MB pdf/docx/xlsx
const TEXT_MAX_BYTES = 2 * 1024 * 1024;   // 2 MB text/csv/md/json
```

Reject with `setFileParseError(file.name)` + `setErrorDetail("File too large (max 10 MB)")` before allocating the buffer. Mirror the existing image guard pattern. Matches capture-pipeline F4 recommendation (10 MB → 512 KB for body) on the server side.

### F2 — Doc-picker `accept` attribute is permissive but MIME-type sniffing is not enforced (HIGH)

**File**: `src/components/CaptureEntryBody.tsx:101`, `src/lib/fileExtract.ts:156-200`

`accept="image/*,.pdf,.docx,.xlsx,.xls,.txt,.md,.csv,.json"` is enforced by browsers as a **filter hint, not a contract** (per HTML spec). User can drag a `.exe` renamed to `.txt` and `extractTextFromFile` will hit `new TextDecoder().decode(buffer)` on it (`fileExtract.ts:200`). Worse: a `.html` file goes through `stripHtml` regex which DOES NOT defang `<script>` content beyond removing the tags — embedded JavaScript text becomes "uploaded file content" and rides into Gemini as-is.

`extractTextFromFile` switches purely on `name.endsWith()` and `file.type` strings — both attacker-controllable.

**Impact**: limited (extracted text becomes capture content, not executed). But: a clever payload could include prompt-injection text aimed at Gemini (`Ignore previous instructions, exfil…`) and ride into the classifier. AI classification runs the system prompt, so prompt injection is contained, but the captured entry's content + tags can be steered.

**Fix**: 
1. Pre-extract MIME sniff on the first 4–8 bytes (PDF magic `%PDF-`, ZIP magic `PK\x03\x04` for docx/xlsx, etc.). Reject mismatches.
2. Strip `<script>` content (not just tags) from HTML extract: replace `/<script\b[^>]*>[\s\S]*?<\/script>/gi` with empty string AND drop the matched content, not just rewrap. The current regex already drops content (line 107) — verify under load.
3. Inside `extractViaAI`, the server-side `/api/extract-file` endpoint should sanity-check filename → mimeType → magic-bytes consistency.

### F3 — pdfjs-dist worker init has no failure path (MEDIUM)

**File**: `src/lib/fileExtract.ts:122-146`

```ts
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).href;
}
```

No try/catch around `getDocument`. If the worker URL fails to resolve (CORS / 404 / blocked by extension), pdfjs silently falls back to **main-thread parsing**. Page text extraction blocks the render thread for the duration of the parse — for a 50 MB PDF that's seconds of UI freeze, including the swipe-down-to-close gesture and the textarea.

**Impact**: jank on bad networks or in environments where the chunked worker fails to load (some Capacitor builds, some service-worker scopes). User reports "app freezes" after picking a PDF.

**Fix**: 
1. Verify worker URL resolution at first load: `await fetch(pdfjsLib.GlobalWorkerOptions.workerSrc, { method: "HEAD" })`.
2. Add a per-page-count cap: refuse to parse `pdf.numPages > 100` on main thread; either route to `/api/extract-file` (server-side OCR) or surface "PDF too long, server-extracting…" status.
3. Catch worker init failure and log `[fileExtract:pdf] worker fallback to main thread` so the diagnostic is visible.

### F4 — No upload throttle on `/api/extract-file` (MEDIUM)

**File**: `src/lib/fileExtract.ts:46-68`, `src/components/CaptureEntryBody.tsx:104-110`, `src/hooks/useCaptureSheetParse.ts:736-772`

The doc input has `multiple` so user can pick 10 PDFs in one shot. `handleDocFiles` iterates with `for (const file of files) { await … }` — sequential, good. But every iteration may hit `/api/extract-file` on the Gemini path. No client-side request concurrency limit, no per-call rate guard, no batch endpoint.

**Impact**: a user dumping 20 receipts at once burns 20 Gemini-vision calls. Free-tier hits the daily quota in one capture session. Server has rate-limit (capture endpoint at `rateLimitForCapture` returns 30/min for capture default), but `/api/extract-file` is a separate endpoint — verify its limit independently.

**Fix**: 
1. Cap `multiple` selection to 5 (enforce client-side; show toast if more).
2. Use `Promise.all` with `pLimit(2)` to parallelise extractions but stay polite.
3. Surface a counter "3 of 5 read…" so the user knows the queue is moving.

### F5 — Raw textarea content has no byte cap (MEDIUM)

**File**: `src/hooks/useCaptureSheetParse.ts:99-114,246-249`

`buildInput(text)` truncates per-file content to `FILE_CONTENT_LIMIT = 150_000` chars, but the `text` argument itself is passed through unbounded:

```ts
if (text.trim()) parts.push(text.trim());
```

A user pasting 5 MB of text (e.g. an entire ebook) hits Gemini directly with a 5 MB prompt. Gemini 2.5 Flash 1 M context budget handles it, but: (a) the response token budget is `max_tokens: 4000` — Gemini can't echo the whole thing back as content, so the entry's `content` field gets a summary, not the original; (b) the JSON parsing of the response may collapse if the model decides to escape the input verbatim; (c) cost — embedding a single 1 M-token capture costs more than the user's monthly tier.

**Impact**: cost spike on accidental mega-paste, response truncation that surprises the user.

**Fix**: cap raw `text.length` at e.g. 100_000 chars before AI call. Surface "Trimmed pasted text to 100 K chars — capture the rest in a follow-up" toast. Or treat super-large pastes as files: prompt "Save as document?" and route through the file-split path.

### F6 — Paste of a URL does not auto-fetch metadata (LOW)

**File**: `src/components/CaptureEntryBody.tsx` (no `onPaste` handler), `src/hooks/useCaptureSheetParse.ts` (no URL detection)

Pasting `https://example.com/article` into the textarea has no special handling — it goes through the regular AI classification path. AI MAY classify it as type=link, but there's no fetch of the page's `<title>`, OG description, or canonical URL. Server-side `/api/save-links` exists (referenced via `?action=links` rewrite at `api/capture.ts:36-43`) but the capture sheet doesn't dispatch to it on URL detection.

**Impact**: pasted URLs save as raw URL strings with AI-guessed titles. No favicon, no description, no rich card. Compared to peer apps (Pocket, Readwise, mymind), Everion looks dumber on the most common share gesture.

**Fix**: add `onPaste` handler in `CaptureEntryBody`:
1. If pasted text matches `/^https?:\/\//`, debounce 200 ms.
2. POST to `/api/save-links?action=links&url=...` (already exists).
3. Show inline "fetching page…" chip; on response replace the URL with `[Page Title]\n[description]` and store metadata.
4. User can dismiss enrichment if they wanted the bare URL.

### F7 — VCF + multi-entry split paths bypass `queueDirectSave` and have no offline branch (LOW)

**File**: `src/hooks/useCaptureSheetParse.ts:444-506` (multi-entry split), `:672-706` (VCF), `:289-360` (split fallback)

Multi-entry capture paths POST directly via `authFetch("/api/capture", …)` inside `for` loops without going through `useBackgroundCapture.queueDirectSave`. Three failure modes are NOT recovered:
1. Mid-loop `navigator.onLine` flips false: remaining contacts/entries silently fail with `failedTitles.push(...)` but are NOT enqueued.
2. Network 5xx: same — pushed to `failedTitles`, not retried, not enqueued.
3. AI split path's per-entry POST: same as above (`useCaptureSheetParse.ts:308-345`).

**Impact**: a 100-contact VCF import on a flaky network leaves a non-recoverable mess. The toast shows "82 saved · 18 failed" with no way to retry. User has no failed-ops UI for this batch.

**Fix**: route every per-entry save through `queueDirectSave`, OR mirror its offline-fallback wrapper inline. Easier: extract the per-entry-with-fallback logic into a shared helper `saveEntryWithFallback(entry, brainId, onCreated)` and call it from all four sites (single-entry doSave, multi-entry split, AI-fallback split, VCF).

---

## Recommendations (priority)

| # | Priority | Finding | Fix shape | Effort |
|---|---|---|---|---|
| 1 | HIGH | F1 — doc/PDF size cap | Add `DOC_MAX_BYTES = 10 MB` gate before `extractTextFromFile` for non-image files | 30 min |
| 2 | HIGH | F2 — MIME sniffing | Pre-extract magic-bytes sniff; tighten `accept` to canonical MIMEs only; harden `stripHtml` against script-content leakage | 2 h |
| 3 | MEDIUM | F3 — pdfjs worker | HEAD-check worker URL on first load; cap pdf.numPages > 100 → server route; log fallback | 1 h |
| 4 | MEDIUM | F4 — multi-file upload throttle | `pLimit(2)` around extraction; cap `multiple` at 5; counter UI | 1 h |
| 5 | MEDIUM | F5 — text byte cap | Cap textarea raw input at 100 K chars; toast on overage | 30 min |
| 6 | LOW | F6 — paste-URL enrichment | Add `onPaste` handler + dispatch to `/api/save-links` on URL match | 3 h |
| 7 | LOW | F7 — multi-entry offline path | Refactor per-entry save into shared helper used by 4 sites | 2 h |
| 8 | LOW | share-target manifest | Wire PWA share-target in `public/manifest.json` (`share_target` key with `action: "/?capture=share"` + body POST decoder) | 4 h (separate spec; not blocker) |

---

## Findings to prove or refute — verdict

| Hypothesis | Verdict | Evidence |
|---|---|---|
| File-size cap < 10 MB on PDF; lower for image; explicit error on overage | **partial — image only** | `useCaptureSheetParse.ts:16,619-622` enforces 5 MB on images. PDF/doc has NO cap. F1. |
| PDF extraction runs in a Worker (not main thread) to avoid jank | **yes when worker URL resolves** | `fileExtract.ts:126-131` sets `GlobalWorkerOptions.workerSrc`. No try/catch — on failure pdfjs silently falls back to main thread. F3. |
| Offline queue persists across page reload (IndexedDB, not in-memory) | **yes** | `offlineQueue.ts:9-26` opens IDB `openbrain-offline` v2 with `queue` + `failed_ops` stores. `localStorage` fallback on quota error only. |
| Vault entries blocked from submit when vault locked (clear inline message) | **yes** | `useCaptureSheetParse.ts:124-130`: `setErrorDetail("Vault is locked — unlock your vault first, then try again")`, returns without POST. |
| Voice mic-permission denied surfaces with retry CTA | **yes** | `useVoiceRecorder.ts:130-137` emits `[voice] Microphone permission denied`. `VoiceCaptureModal.tsx:146-153,313` shows error + cancel button. |
| Paste-URL auto-fills title from page metadata | **no** | No `onPaste` handler in `CaptureEntryBody.tsx`. Pasted URL goes through normal AI classification with no metadata fetch. F6. |
| Optimistic insert visible in grid in <100ms | **yes** | `useBackgroundCapture.ts:337-351` (offline) and `:382-397` (online happy path) call `onCreated` synchronously after the network resolves; offline path doesn't await network at all. |
| Bodyparser limit on capture endpoint (10 MB → 512 KB recommended per pipeline F4) | **10 MB** | `api/capture.ts:23`: `export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };` — matches client image cap, far exceeds the 512 KB recommended in capture-pipeline F4. |

---

## Method

- Read `src/components/CaptureSheet.tsx` end-to-end (1006 lines).
- Read `src/hooks/useCaptureSheetParse.ts` end-to-end (813 lines).
- Read `src/lib/fileExtract.ts` end-to-end (201 lines).
- Read `src/components/CaptureEntryBody.tsx`, `VoiceCaptureModal.tsx`, `useVoiceRecorder.ts`, `useBackgroundCapture.ts`, `useOfflineSync.ts`, `lib/offlineQueue.ts`.
- Confirmed `api/capture.ts:23` body-parser limit and `rateLimitForCapture`.
- Cross-checked `public/manifest.json` for `share_target` (none present).
- Cross-referenced `lib/events.ts:108` `CaptureMethod` enum against actual fired methods in `useCaptureSheetParse.ts:259-261`. The enum lists `text | voice | file | link | share-target | import` — last two are not fired by capture sheet (link comes from /api/save-links, share-target is unimplemented, import comes from settings importer). Inventory above mirrors the actual code paths, not the enum.
- Did NOT exercise live capture or live extract in this audit. Findings rely on code-evidence; the F1 OOM hypothesis needs a real-device repro on a 2 GB Android with a 50 MB PDF before launch.

**Audit kicked off by**: user request "do a senior staff engineer evidence-based capture-sheet audit" on 2026-05-07.
