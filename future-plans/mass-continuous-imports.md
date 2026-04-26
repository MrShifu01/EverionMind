# Mass Continuous Imports — Architecture

Architecture for ingesting data from Gmail, Google Drive, Notion, Obsidian, and local computer folders into Everion memory.

---

## Shared Core

Both architectures share the same pipeline:

```
[Source Connectors]
        ↓
  [File Extractor]      → parse docx, pdf, xlsx, images → plain text
        ↓
  [Normalizer]          → common doc schema: {source, id, title, content, metadata, timestamp}
        ↓
[Chunker + Summarizer]  → split large content, optionally Claude-summarize before ingest
        ↓
  [Deduplicator]        → hash content, skip if already ingested
        ↓
[Everion /v1/ingest]
```

---

## Architecture A — One-Time Backfill

A single script, runs once, paginates through all history.

```
backfill.ts
├── connectors/
│   ├── gmail.ts        ← Gmail API, paginate all threads
│   ├── drive.ts        ← Drive API files.list, paginate
│   ├── notion.ts       ← Notion search + databases
│   ├── obsidian.ts     ← recursive markdown walker
│   └── filesystem.ts  ← recursive file walker (txt, pdf, docx)
├── pipeline/
│   ├── normalize.ts
│   ├── chunk.ts
│   ├── summarize.ts    ← optional Claude call per chunk
│   └── ingest.ts       ← POST /v1/ingest
└── state/
    └── checkpoint.json ← tracks progress so it can resume on crash
```

Key concerns:
- Rate limiting per API
- Checkpoint file so a crash doesn't restart from zero
- Filter noise before ingesting (calendar invites, promotional emails, etc.)

---

## Architecture B — Ongoing Sync

A daemon/scheduler that continuously detects changes and ingests only deltas.

```
sync-daemon/
├── connectors/
│   ├── gmail.ts        ← polls historyId OR receives Google Pub/Sub push
│   ├── drive.ts        ← Drive Changes API with page tokens
│   ├── notion.ts       ← polls last_edited_time OR Notion webhooks
│   ├── obsidian.ts     ← chokidar file watcher on vault dir
│   └── filesystem.ts  ← chokidar file watcher on watched dirs
├── pipeline/           ← same normalize → chunk → summarize → ingest
├── state/
│   └── cursors.db      ← SQLite: per-source last-processed token/timestamp
└── scheduler.ts        ← cron or event loop, fires each connector on interval
```

Change detection per source:

| Source | Mechanism |
|---|---|
| Gmail | `historyId` delta poll or Google Pub/Sub push |
| Google Drive | `Changes.list` with `pageToken` |
| Notion | Poll `last_edited_time` or Notion webhooks |
| Obsidian | `chokidar` watches vault directory |
| Computer folders | `chokidar` watches configured paths |

The cursor store is the critical piece — it makes sync idempotent and restartable.

---

## Build Order

1. **Build backfill first** — proves connectors, normalizer, and ingest pipeline end-to-end.
2. **Reuse for sync** — swap "fetch all" for "fetch since cursor" per connector.
3. **Deduplicator protects overlap** — if backfill and sync ever run together, content hashing prevents double-ingestion.

---

## UX Design — Non-Technical Users

Core principle: **she should never see anything that sounds like a computer.** No "OAuth", no "API tokens", no "connector config". Every state — idle, syncing, done, error — should be expressible in one friendly line.

### Onboarding — "Connect Your World"

A wizard, one step at a time. Big tiles, friendly icons:

```
┌─────────────────────────────────────────┐
│  Let's help Everion learn about you.    │
│  Pick what you'd like to connect:       │
│                                         │
│  📧 Gmail   📁 Google Drive   📓 Notion │
│  📒 Obsidian   🗂 My Computer Files     │
│                                         │
│  [Skip for now]      [Connect Gmail →]  │
└─────────────────────────────────────────┘
```

Each tile click opens a standard Google/Notion sign-in popup. After it closes, the tile turns green with a checkmark. No explanation needed.

### Import — Make It Feel Like Magic

Once connected, she hits one button: **"Start Learning"**

Then a friendly progress screen, not a technical log:

```
Everion is reading your emails...
━━━━━━━━━━━━━━━░░░░░  247 of 1,203

💡 Did you know? Everion will remember
   important conversations so you can
   find them just by asking.
```

When done: **"Everion learned 847 new things about you!"** — not "847 entries ingested".

### Step 2 — "What Matters to You?" (Pre-Import Preferences)

Before anything is imported, the user gets a simple screen to shape what Everion learns. No settings panel — just friendly toggles and checkboxes, one section per connected source.

```
┌─────────────────────────────────────────────┐
│  What should Everion pay attention to?      │
│                                             │
│  📧 Gmail                                   │
│  ☑ Conversations with people I know        │
│  ☑ Emails I wrote or replied to            │
│  ☐ Newsletters and subscriptions           │
│  ☐ Promotions and offers                   │
│  ☐ Receipts and orders                     │
│                                             │
│  📁 Google Drive                            │
│  ☑ Documents I created                     │
│  ☑ Documents shared with me               │
│  ☐ Shared team folders                     │
│                                             │
│  🗂 My Computer Files                       │
│  ☑ Documents (Word, PDF, text files)       │
│  ☐ Photos and images                       │
│  ☐ Spreadsheets                            │
│                                             │
│  📅 How far back should Everion look?       │
│     ○ Last 6 months                        │
│     ● Last 2 years  ← recommended          │
│     ○ Everything ever                      │
│                                             │
│  [Back]              [Start Learning →]     │
└─────────────────────────────────────────────┘
```

**Design rules for this screen:**
- Smart defaults pre-ticked — the user should only need to *untick* things, not figure out what to enable
- No technical labels. "Newsletters and subscriptions" not "Gmail label:^i category:promotions"
- Date range is the one genuinely important setting — it determines cost and duration of the first import
- Per-source sections only appear for sources that were connected in the previous step

**What these preferences map to technically:**

| User choice | Technical filter |
|---|---|
| "Conversations with people I know" | Only threads with replies, skip no-reply senders |
| "Emails I wrote or replied to" | Filter by `from:me` or `in:sent` |
| "Newsletters" unchecked | Skip Gmail `category:promotions` + `category:updates` |
| "Last 2 years" | Set `after:` date filter on all connectors |
| "Documents I created" | Drive filter `createdBy=me` |
| "Photos" unchecked | Exclude mime types `image/*` |

### Ongoing Sync — Invisible by Default

Sync just happens. The only UI is a subtle status line on the dashboard:

```
✓ Everything is up to date  (last updated 2 hours ago)
```

If something breaks, plain English:

> "Everion lost connection to your Gmail. Tap here to reconnect — it takes 10 seconds."

### Technical Reality → What the User Sees

| Technical reality | What she sees |
|---|---|
| OAuth authentication | "Sign in with Google" |
| Connector config | A tile she taps once |
| Preference filters | Friendly checkboxes before import |
| File extraction (PDF, DOCX, XLSX) | Invisible |
| Chunking + summarization | Invisible |
| Sync daemon running | "Everything is up to date" |
| Rate limit throttling | Progress bar just moves slowly |
| API error | "Reconnect" prompt in plain English |
| Deduplication | Nothing — it just works |
| Scanned PDF (OCR needed) | "This file couldn't be read, skipping" |

---

## File Extraction Layer

Most real-world content is binary, not plain text. The extractor sits between the connector and normalizer, converting file formats into readable content before anything else runs.

### Extraction by Format

| Format | Library (Node.js) | Notes |
|---|---|---|
| PDF | `pdf-parse` or `pdfjs-dist` | Scanned PDFs return empty text — see below |
| DOCX | `mammoth` | Preserves headings, good for semantic chunking |
| XLSX / Excel | `xlsx` (SheetJS) | Extract per sheet; skip sheets that are pure formulas |
| CSV | Built-in | Treat rows as structured facts |
| Images (JPG, PNG) | Tesseract OCR or Google Vision API | Only if user opted in |
| TXT / MD | None needed | Already plain text |

### Scanned PDFs — The Edge Case

Scanned PDFs look like normal PDFs but contain images of text — `pdf-parse` returns nothing. Options:

- **Skip and flag** — tell the user "this file couldn't be read"
- **Tesseract OCR** — free, runs locally, slower and less accurate
- **AWS Textract / Google Document AI** — accurate, handles handwriting, costs per page

Recommendation: skip by default, surface a count ("3 files couldn't be read") with an option to retry with OCR.

### Gmail Attachments Specifically

Attachments aren't included in the message body. Gmail API requires a separate download step:

```
gmail.users.messages.get()               ← get message, find attachment part IDs in payload
gmail.users.messages.attachments.get()   ← download each attachment by ID
→ pass to File Extractor
→ append extracted text to email content before normalizing
```

### Updated "What Matters to You?" Preferences

The preferences screen reflects file type choices per source:

```
┌─────────────────────────────────────────────┐
│  📧 Gmail                                   │
│  ☑ Conversations with people I know        │
│  ☑ Emails I wrote or replied to            │
│  ☑ Also read files attached to emails      │
│  ☐ Newsletters and subscriptions           │
│  ☐ Promotions and offers                   │
│  ☐ Receipts and orders                     │
│                                             │
│  🗂 My Computer Files                       │
│  ☑ Word documents (.docx)                  │
│  ☑ PDFs                                    │
│  ☑ Text files (.txt, .md)                  │
│  ☐ Excel spreadsheets                      │
│  ☐ Images (photos, screenshots)            │
└─────────────────────────────────────────────┘
```

Spreadsheets are off by default — a 500-row budget sheet as raw text is noise, not memory. Images are off by default — OCR is slow and costly at scale.

---

## AI Model Requirements

The AI role is narrow — it only touches one step: **summarization before ingest**. Everything else (fetching, normalizing, chunking, deduplicating, storing) is plain code.

**Does it need to be agentic?**

No. Both architectures are deterministic pipelines. Agentic would mean the AI is deciding *what to do next* — here it just reads a piece of content and returns a shorter version.

**Does it need a frontier model?**

No. The task is simple: *"Extract the key facts from this document worth remembering."*

| Model | Cost | Verdict |
|---|---|---|
| Claude Opus / GPT-4o | $$$ | Overkill |
| Claude Haiku / GPT-4o-mini | $ | Good fit — fast, cheap, capable enough |
| Local model (Llama 3, Mistral) | Free | Works if zero API cost is a priority |
| No AI at all | Free | Valid for structured sources like Obsidian |

**Recommendation:** Use **Claude Haiku** — fractions of a cent per document, already in the Claude ecosystem. For Obsidian and local markdown files, skip summarization entirely and chunk by heading.

The one place a smarter model earns its cost is **noise filtering on Gmail** (deciding whether a given email is worth ingesting at all) — but even that is well within Haiku's capability.
