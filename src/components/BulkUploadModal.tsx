// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { aiFetch } from "../lib/aiFetch";
import { callAI } from "../lib/ai";
import { authFetch } from "../lib/authFetch";
import { getUserModel, getEmbedHeaders } from "../lib/aiSettings";
import { isSupportedFile, isTextFile, isDocxFile, isExcelFile, readTextFile, readDocxFile, readExcelFile, readFileAsBase64, ACCEPT_STRING } from "../lib/fileParser";
import { shouldSplitContent, buildSplitPrompt, parseAISplitResponse } from "../lib/fileSplitter";
import { getTypeConfig } from "../data/constants";
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
  pending: "#555",
  reading: "var(--color-primary)",
  splitting: "var(--color-primary)",
  saving: "var(--color-primary)",
  done: "#4ade80",
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
    files.map((file) => ({ file, status: "pending" as FileStatus }))
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
                      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
                      { type: "text", text: "Extract ALL text from this document. Preserve structure. Output just the content, no commentary." },
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
          let parsedEntries: { title: string; content: string; type: string; icon?: string; metadata?: Record<string, unknown>; tags?: string[] }[];

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
            const embedHeaders = parsed.type !== "secret" ? (getEmbedHeaders() || {}) : {};
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
                  }).catch(() => {});
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
    return () => { cancelledRef.current = true; };
  }, []);

  const completedCount = items.filter((i) => i.status === "done" || i.status === "error").length;
  const progress = files.length ? completedCount / files.length : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-lg flex flex-col rounded-2xl border"
        style={{ background: "#1a1919", borderColor: "rgba(72,72,71,0.2)", maxHeight: "80vh" }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-white">
              📁 Bulk Upload — {files.length} file{files.length !== 1 ? "s" : ""}
            </span>
            {isDone && (
              <span className="text-xs font-semibold" style={{ color: "#4ade80" }}>
                {totalSaved} entries saved
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div className="h-1 rounded-full mt-3 overflow-hidden" style={{ background: "rgba(72,72,71,0.3)" }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress * 100}%`,
                background: isDone ? "#4ade80" : "var(--color-primary)",
              }}
            />
          </div>
          <p className="text-xs mt-2" style={{ color: "#555" }}>
            {isDone ? "All done!" : `${completedCount} of ${files.length} processed`}
          </p>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
              style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}
            >
              {/* Icon */}
              <span className="text-base flex-shrink-0">
                {item.status === "done" ? "✅" : item.status === "error" ? "❌" : "📄"}
              </span>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{item.file.name}</p>
                {item.status === "error" && item.errorMsg && (
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--color-error)" }}>{item.errorMsg}</p>
                )}
                {item.status === "done" && item.entriesCount !== undefined && (
                  <p className="text-[11px] mt-0.5" style={{ color: "#4ade80" }}>
                    {item.entriesCount} entr{item.entriesCount !== 1 ? "ies" : "y"} saved
                  </p>
                )}
              </div>

              {/* Status badge */}
              <span
                className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0"
                style={{ color: STATUS_COLOR[item.status] }}
              >
                {item.status === "pending" && !isDone ? (
                  <span style={{ color: "#555" }}>·  ·  ·</span>
                ) : (
                  STATUS_LABEL[item.status]
                )}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex-shrink-0 border-t" style={{ borderColor: "rgba(72,72,71,0.2)" }}>
          <button
            onClick={() => {
              cancelledRef.current = true;
              onCancel();
            }}
            className="w-full py-2.5 rounded-xl border text-sm transition-colors hover:bg-white/5"
            style={{ borderColor: "rgba(72,72,71,0.3)", color: isDone ? "#aaa" : "#777" }}
          >
            {isDone ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
