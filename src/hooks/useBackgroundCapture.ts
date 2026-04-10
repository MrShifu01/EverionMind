import { useState, useCallback, useRef } from "react";
import { extractTextFromFile } from "../lib/fileExtract";
import { callAI } from "../lib/ai";
import { authFetch } from "../lib/authFetch";
import { getEmbedHeaders } from "../lib/aiSettings";
import { parseAISplitResponse } from "../lib/fileSplitter";
import { PROMPTS } from "../config/prompts";
import type { Entry } from "../types";

export type TaskStatus = "extracting" | "classifying" | "saving" | "done" | "error";

export interface BackgroundTask {
  id: string;
  filename: string;
  status: TaskStatus;
  error?: string;
  warning?: string;
  entryTitle?: string;
}

const FILE_CONTENT_LIMIT = 6000;

function extractJSON(text: string): string {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const m = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return m ? m[1] : cleaned;
}

type ParsedEntry = { title: string; content?: string; type?: string; tags?: string[]; metadata?: Record<string, unknown> };

function parseAIEntries(aiText: string, baseName: string): { entries: ParsedEntry[]; parseError: string } {
  let parseError = "";
  try {
    const jsonStr = extractJSON(aiText);
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const entries = parsed.map((e: any, i: number) => ({
        ...e,
        title: (e?.title || "").trim() || `${baseName}${parsed.length > 1 ? ` (${i + 1})` : ""}`,
      }));
      return { entries, parseError: "" };
    }
    if (parsed && typeof parsed === "object") {
      // Object response — use AI-classified fields, fallback title to filename
      const entry: ParsedEntry = {
        ...parsed,
        title: (parsed.title || "").trim() || baseName,
      };
      return { entries: [entry], parseError: "" };
    }
    parseError = "Unexpected JSON shape";
  } catch (e: any) {
    parseError = e?.message || String(e);
  }

  // Try fileSplitter as a last resort
  const splitterEntries = parseAISplitResponse(aiText);
  if (splitterEntries.length > 0) return { entries: splitterEntries, parseError: "" };

  return { entries: [], parseError: parseError || "Parse failed" };
}

export function useBackgroundCapture() {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const taskIdRef = useRef(0);

  const updateTask = useCallback((id: string, update: Partial<BackgroundTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...update } : t)));
  }, []);

  const dismissTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status !== "done" && t.status !== "error"));
  }, []);

  const processFiles = useCallback(
    async (files: File[], brainId: string | undefined, onCreated: (entry: Entry) => void) => {
      const newTasks: BackgroundTask[] = files.map((f) => ({
        id: String(++taskIdRef.current),
        filename: f.name,
        status: "extracting" as TaskStatus,
      }));
      setTasks((prev) => [...prev, ...newTasks]);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const taskId = newTasks[i].id;
        const baseName = file.name.replace(/\.[^.]+$/, "");

        try {
          // Step 1: Extract text
          updateTask(taskId, { status: "extracting" });
          let rawText = "";
          try {
            rawText = await extractTextFromFile(file);
          } catch (e: any) {
            updateTask(taskId, { status: "error", error: `Extract failed: ${e?.message || String(e)}` });
            continue;
          }
          if (!rawText.trim()) {
            updateTask(taskId, { status: "error", error: "No text extracted from file" });
            continue;
          }

          const truncated = rawText.length > FILE_CONTENT_LIMIT
            ? rawText.slice(0, FILE_CONTENT_LIMIT) + "\n…[truncated]"
            : rawText;
          const input = `[File: ${file.name}]\n${truncated}`;

          // Step 2: AI classify — always try, fall back gracefully on failure
          updateTask(taskId, { status: "classifying" });
          let entries: ParsedEntry[] = [];
          let classifyWarning = "";

          try {
            const aiRes = await callAI({
              system: PROMPTS.CAPTURE,
              max_tokens: 1000,
              brainId,
              messages: [{ role: "user", content: input }],
            });
            const aiData = await aiRes.json();

            if (!aiRes.ok) {
              classifyWarning = aiData?.error?.message || `AI error ${aiRes.status}`;
            } else {
              const aiText: string = aiData.content?.[0]?.text || aiData.choices?.[0]?.message?.content || "";
              if (!aiText) {
                classifyWarning = "AI returned empty response";
              } else {
                const { entries: parsed, parseError } = parseAIEntries(aiText, baseName);
                if (parsed.length > 0) {
                  entries = parsed;
                } else {
                  classifyWarning = `AI parse failed: ${parseError} · raw: "${aiText.slice(0, 80)}"`;
                }
              }
            }
          } catch (e: any) {
            classifyWarning = `AI call failed: ${e?.message || String(e)}`;
          }

          // If AI classification failed, fall back to raw note with filename
          if (entries.length === 0) {
            entries = [{ title: baseName, content: rawText, type: "note" }];
          }

          // Step 3: Save all entries
          updateTask(taskId, { status: "saving" });
          const embedHeaders = getEmbedHeaders();
          let savedTitle = "";
          for (const entry of entries) {
            const res = await authFetch("/api/capture", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(embedHeaders || {}) },
              body: JSON.stringify({
                p_title: entry.title,
                p_content: entry.content || "",
                p_type: entry.type || "note",
                p_metadata: entry.metadata || {},
                p_tags: entry.tags || [],
                p_brain_id: brainId,
              }),
            });
            if (res.ok) {
              const result = await res.json();
              if (!savedTitle) savedTitle = entry.title;
              onCreated({
                id: result?.id || Date.now().toString(),
                title: entry.title,
                content: entry.content || "",
                type: (entry.type || "note") as Entry["type"],
                metadata: entry.metadata || {},
                pinned: false,
                importance: 0,
                tags: entry.tags || [],
                created_at: new Date().toISOString(),
              } as Entry);
            }
          }

          updateTask(taskId, {
            status: "done",
            entryTitle: savedTitle || baseName,
            warning: classifyWarning || undefined,
          });
          setTimeout(() => dismissTask(taskId), 8000);
        } catch (e: any) {
          updateTask(taskId, { status: "error", error: e?.message || String(e) });
        }
      }
    },
    [updateTask, dismissTask],
  );

  return { tasks, processFiles, dismissTask, dismissAll };
}
