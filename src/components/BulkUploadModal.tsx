import { useState, useEffect, useRef } from "react";
import { aiFetch } from "../lib/aiFetch";
import { callAI } from "../lib/ai";
import { authFetch } from "../lib/authFetch";
import { getUserModel, getEmbedHeaders } from "../lib/aiSettings";
import {
  isSupportedFile,
  isTextFile,
  isDocxFile,
  isExcelFile,
  readTextFile,
  readDocxFile,
  readExcelFile,
  readFileAsBase64,
} from "../lib/fileParser";
import { shouldSplitContent, buildSplitPrompt, parseAISplitResponse } from "../lib/fileSplitter";
import { registerTypeIcon, pickDefaultIcon } from "../lib/typeIcons";
import { PROMPTS } from "../config/prompts";

type FileStatus = "pending" | "reading" | "splitting" | "saving" | "done" | "error";

interface BulkFileItem {
  file: File;
  status: FileStatus;
  entriesCount?: number;
  errorMsg?: string;
}

interface BulkUploadModalProps {
  files: File[];
  brainId: string;
  brains: { id: string; name: string; type?: string }[];
  onDone: (totalSaved: number) => void;
  onCancel: () => void;
  onCreated: (entry: unknown) => void;
}

const STATUS_LABEL: Record<FileStatus, string> = {
  pending: "Pending",
  reading: "Reading…",
  splitting: "Splitting…",
  saving: "Saving…",
  done: "Done",
  error: "Error",
};

const STATUS_COLOR: Record<FileStatus, string> = {
  pending: "var(--color-on-surface-variant)",
  reading: "var(--color-primary)",
  splitting: "var(--color-primary)",
  saving: "var(--color-primary)",
  done: "var(--color-secondary)",
  error: "var(--color-error)",
};

export default function BulkUploadModal({
  files,
  brainId,
  brains,
  onDone,
  onCancel,
  onCreated,
}: BulkUploadModalProps) {
  const [items, setItems] = useState<BulkFileItem[]>(() =>
    files.map((file) => ({ file, status: "pending" as FileStatus })),
  );
  const [isDone, setIsDone] = useState(false);
  const [totalSaved, setTotalSaved] = useState(0);
  const cancelledRef = useRef(false);

  function updateItem(index: number, update: Partial<BulkFileItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...update } : item)));
  }

  useEffect(() => {
    let total = 0;

    async function run() {
      for (let i = 0; i < files.length; i++) {
        if (cancelledRef.current) break;
        const file = files[i];

        // Validate
        if (!isSupportedFile(file)) {
          updateItem(i, { status: "error", errorMsg: "Unsupported file type" });
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          updateItem(i, { status: "error", errorMsg: "File too large (max 10MB)" });
          continue;
        }

        try {
          // Read / extract text
          updateItem(i, { status: "reading" });
          let extractedText = "";

          if (isTextFile(file)) {
            extractedText = await readTextFile(file);
          } else if (isDocxFile(file)) {
            extractedText = await readDocxFile(file);
          } else if (isExcelFile(file)) {
            extractedText = await readExcelFile(file);
          } else {
            // PDF: send to Anthropic document API for text extraction
            const { base64 } = await readFileAsBase64(file);
            const apiRes = await aiFetch("/api/anthropic", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: getUserModel(),
                max_tokens: 4000,
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "document",
                        source: { type: "base64", media_type: "application/pdf", data: base64 },
                      },
                      {
                        type: "text",
                        text: "Extract ALL text from this document. Preserve structure. Output just the content, no commentary.",
                      },
                    ],
                  },
                ],
              }),
            });
            const data = await apiRes.json();
            extractedText = data.content?.[0]?.text?.trim() || "";
          }

          if (!extractedText) {
            updateItem(i, { status: "error", errorMsg: "No text extracted" });
            continue;
          }

          // AI split
          updateItem(i, { status: "splitting" });
          const brainType = brains.find((b) => b.id === brainId)?.type || "personal";
          let parsedEntries: {
            title: string;
            content: string;
            type: string;
            icon?: string;
            metadata?: Record<string, unknown>;
            tags?: string[];
          }[];

          if (shouldSplitContent(extractedText)) {
            const splitRes = await callAI({
              max_tokens: 4000,
              system: PROMPTS.FILE_SPLIT,
              brainId,
              messages: [{ role: "user", content: buildSplitPrompt(extractedText, brainType) }],
            });
            const splitData = await splitRes.json();
            const raw = splitData.content?.[0]?.text || "[]";
            parsedEntries = parseAISplitResponse(raw);
          } else {
            parsedEntries = [
              {
                title: file.name.replace(/\.[^.]+$/, "").slice(0, 60),
                content: extractedText.slice(0, 500),
                type: "note",
                tags: [],
              },
            ];
          }

          if (!parsedEntries.length) {
            updateItem(i, { status: "error", errorMsg: "No entries parsed" });
            continue;
          }

          // Save entries
          updateItem(i, { status: "saving" });
          let savedCount = 0;

          for (const parsed of parsedEntries) {
            if (cancelledRef.current) break;
            const captureHeaders: Record<string, string> = { "Content-Type": "application/json" };
            const embedHeaders = parsed.type !== "secret" ? getEmbedHeaders() || {} : {};
            Object.assign(captureHeaders, embedHeaders);

            const rpcRes = await authFetch("/api/capture", {
              method: "POST",
              headers: captureHeaders,
              body: JSON.stringify({
                p_title: parsed.title,
                p_content: parsed.content || "",
                p_type: parsed.type || "note",
                p_metadata: parsed.metadata || {},
                p_tags: parsed.tags || [],
                p_brain_id: brainId,
              }),
            });

            if (rpcRes.ok) {
              const result = await rpcRes.json();
              const entryType = parsed.type || "note";
              const entryIcon = parsed.icon || pickDefaultIcon(entryType);
              registerTypeIcon(brainId, entryType, entryIcon);

              if (result?.id && parsed.type !== "secret") {
                const eh = getEmbedHeaders();
                if (eh) {
                  authFetch("/api/embed", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...eh },
                    body: JSON.stringify({ entry_id: result.id }),
                  }).catch((err) => console.error("[BulkUpload] embed enqueue failed", err));
                }
              }

              onCreated({
                id: result?.id || crypto.randomUUID(),
                ...parsed,
                type: entryType,
                pinned: false,
                importance: 0,
                tags: parsed.tags || [],
                created_at: new Date().toISOString(),
              });
              savedCount++;
            }
          }

          total += savedCount;
          updateItem(i, { status: "done", entriesCount: savedCount });
        } catch (err) {
          console.error("[BulkUpload] error processing", file.name, err);
          updateItem(i, { status: "error", errorMsg: "Processing failed" });
        }
      }

      if (!cancelledRef.current) {
        setTotalSaved(total);
        setIsDone(true);
        onDone(total);
      }
    }

    run();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const completedCount = items.filter((i) => i.status === "done" || i.status === "error").length;
  const progress = files.length ? completedCount / files.length : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "var(--color-scrim)" }}
    >
      <div
        className="flex w-full max-w-lg flex-col rounded-2xl border"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-outline-variant)",
          maxHeight: "80vh",
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-on-surface text-sm font-semibold">
              📁 Bulk Upload — {files.length} file{files.length !== 1 ? "s" : ""}
            </span>
            {isDone && (
              <span className="text-xs font-semibold" style={{ color: "var(--color-secondary)" }}>
                {totalSaved} entries saved
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div
            className="mt-3 h-1 overflow-hidden rounded-full"
            style={{ background: "var(--color-outline-variant)" }}
          >
            <div
              className="h-full w-full origin-left rounded-full transition-transform duration-300"
              style={{
                transform: `scaleX(${progress})`,
                background: isDone ? "var(--color-secondary)" : "var(--color-primary)",
              }}
            />
          </div>
          <p className="text-on-surface-variant mt-2 text-xs">
            {isDone ? "All done!" : `${completedCount} of ${files.length} processed`}
          </p>
        </div>

        {/* File list */}
        <div className="flex-1 space-y-2 overflow-y-auto px-5 pb-3">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
              style={{
                background: "var(--color-surface-container)",
                borderColor: "var(--color-outline-variant)",
              }}
            >
              {/* Icon */}
              <span className="flex-shrink-0">
                {item.status === "done" ? (
                  <svg
                    className="h-4 w-4"
                    style={{ color: "var(--color-primary)" }}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ) : item.status === "error" ? (
                  <svg
                    className="h-4 w-4"
                    style={{ color: "var(--color-error)" }}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    style={{ color: "var(--color-on-surface-variant)" }}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                )}
              </span>

              {/* File info */}
              <div className="min-w-0 flex-1">
                <p className="text-on-surface truncate text-sm">{item.file.name}</p>
                {item.status === "error" && item.errorMsg && (
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-error)" }}>
                    {item.errorMsg}
                  </p>
                )}
                {item.status === "done" && item.entriesCount !== undefined && (
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-secondary)" }}>
                    {item.entriesCount} entr{item.entriesCount !== 1 ? "ies" : "y"} saved
                  </p>
                )}
              </div>

              {/* Status badge */}
              <span
                className="flex-shrink-0 text-[10px] font-semibold tracking-wider uppercase"
                style={{ color: STATUS_COLOR[item.status] }}
              >
                {item.status === "pending" && !isDone ? (
                  <span className="text-on-surface-variant">· · ·</span>
                ) : (
                  STATUS_LABEL[item.status]
                )}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex-shrink-0 border-t px-5 py-4"
          style={{ borderColor: "var(--color-outline-variant)" }}
        >
          <button
            onClick={() => {
              cancelledRef.current = true;
              onCancel();
            }}
            className="hover:bg-surface-container text-on-surface-variant w-full rounded-xl border py-2.5 text-sm transition-colors"
            style={{ borderColor: "var(--color-outline-variant)" }}
          >
            {isDone ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
