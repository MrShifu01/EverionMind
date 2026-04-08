import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { callAI } from "../lib/ai";
import { aiFetch } from "../lib/aiFetch";
import { getUserModel, getUserApiKey, getGroqKey, getEmbedHeaders } from "../lib/aiSettings";
import { encryptEntry } from "../lib/crypto";
import { authFetch } from "../lib/authFetch";
import { showToast } from "../lib/notifications";
import { findConnections, scoreTitle } from "../lib/connectionFinder";
import { recordDecision } from "../lib/learningEngine";
import { TC } from "../data/constants";
import { PROMPTS } from "../config/prompts";
import { registerTypeIcon, pickDefaultIcon } from "../lib/typeIcons";
import { isSupportedFile, isTextFile, isDocxFile, isExcelFile, readTextFile, readDocxFile, readExcelFile, readFileAsBase64, ACCEPT_STRING } from "../lib/fileParser";
import { shouldSplitContent, buildSplitPrompt, parseAISplitResponse } from "../lib/fileSplitter";
import BulkUploadModal from "./BulkUploadModal";
import type { Entry, Link } from "../types";

type CaptureStatus =
  | "thinking" | "saving" | "saved-db" | "saved-local" | "saved-raw"
  | "error" | "offline-image" | "img-too-large" | "file-too-large"
  | "unsupported-file" | "reading-file" | "splitting" | "file-empty"
  | "vault-needed" | "mic-denied";

interface ParsedEntry {
  title?: string;
  type?: string;
  tags?: string[];
  content?: string;
  metadata?: Record<string, unknown>;
  icon?: string;
  _raw?: string;
  [key: string]: unknown;
}

interface PreviewModalProps {
  preview: ParsedEntry;
  entries: Entry[];
  onSave: (entry: ParsedEntry) => void;
  onUpdate: (id: string, update: Partial<Entry>) => void | Promise<void>;
  onCancel: () => void;
}

interface QuickCaptureProps {
  entries: Entry[];
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  links?: Link[];
  addLinks?: (links: Link[]) => void;
  onCreated?: (entry: Entry) => void;
  onUpdate?: (id: string, update: Partial<Entry>) => void | Promise<void>;
  isOnline?: boolean;
  refreshCount?: (() => void) | null;
  brainId: string;
  brains?: { id: string; name: string; type?: string }[];
  canWrite?: boolean;
  cryptoKey?: CryptoKey | null;
  onNavigate?: ((id: string) => void) | null;
}

const BRAIN_META_QC = {
  personal: { emoji: "🧠" },
  family: { emoji: "🏠" },
  business: { emoji: "🏪" },
};

function PreviewModal({ preview, entries, onSave, onUpdate, onCancel }: PreviewModalProps) {
  const [title, setTitle] = useState(preview.title || "");
  const [type, setType] = useState(preview.type || "note");
  const [tags, setTags] = useState((preview.tags || []).join(", "));
  const modalRef = useRef<HTMLDivElement>(null);
  const dupes = useMemo(() => {
    if (!title.trim()) return [];
    return entries.filter((e) => scoreTitle(title, e.title) > 50).slice(0, 3);
  }, [title, entries]);

  // Focus trap
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const focusable = Array.from(
      el.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--color-scrim)" }}
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qc-preview-title"
        className="w-full max-w-md rounded-2xl border p-5"
        style={{ background: "var(--color-surface-container-low)", borderColor: "var(--color-outline-variant)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span id="qc-preview-title" className="text-sm font-semibold text-on-surface">Preview before saving</span>
          <button onClick={onCancel} aria-label="Close" className="text-on-surface-variant hover:text-on-surface text-lg transition-colors">✕</button>
        </div>
        <form autoComplete="off" onSubmit={(e) => e.preventDefault()} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              name="entry-title"
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              spellCheck={false}
              className="w-full rounded-xl border px-3 py-2.5 text-sm text-on-surface bg-transparent outline-none focus:border-[var(--color-primary)] transition-colors"
              style={{ borderColor: "var(--color-outline-variant)" }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Type</label>
            <div className="relative">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 pr-9 text-sm text-on-surface outline-none appearance-none cursor-pointer focus:border-[var(--color-primary)] transition-colors"
                style={{ borderColor: "var(--color-outline-variant)", background: "var(--color-surface-container)" }}
              >
                {Object.keys(TC).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: "var(--color-on-surface-variant)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
              Tags <span className="text-on-surface-variant/40">(comma separated)</span>
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tag1, tag2"
              name="entry-tags"
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              spellCheck={false}
              className="w-full rounded-xl border px-3 py-2.5 text-sm text-on-surface bg-transparent outline-none placeholder:text-on-surface-variant/40 focus:border-[var(--color-primary)] transition-colors"
              style={{ borderColor: "var(--color-outline-variant)" }}
            />
          </div>
        </form>
        {dupes.length > 0 && (
          <div className="mt-4 p-3 rounded-xl border" style={{ borderColor: "var(--color-primary-container)", background: "color-mix(in oklch, var(--color-primary) 6%, transparent)" }}>
            <p className="text-xs font-semibold mb-2 text-primary">⚠ Similar entries found — update one instead?</p>
            {dupes.map((d) => (
              <div key={(d as Entry).id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-xs text-on-surface-variant truncate">• {(d as Entry).title}</span>
                <button
                  onClick={() => {
                    onUpdate((d as Entry).id, {
                      title: title.trim(),
                      type,
                      tags: tags.split(",").map((t: string) => t.trim()).filter(Boolean),
                      content: preview.content,
                      metadata: preview.metadata,
                    });
                    onCancel();
                  }}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-lg flex-shrink-0"
                  style={{ color: "var(--color-primary)", background: "var(--color-primary-container)" }}
                >
                  Update this
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border text-sm text-on-surface-variant transition-colors hover:bg-surface-container"
            style={{ borderColor: "var(--color-outline-variant)", background: "transparent" }}
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                ...preview,
                title: title.trim(),
                type,
                tags: tags.split(",").map((tag: string) => tag.trim()).filter(Boolean),
              })
            }
            disabled={!title.trim()}
            className="flex-[2] py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 press-scale"
            style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          >
            Save to Everion
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuickCapture({
  entries,
  setEntries,
  links,
  addLinks,
  onCreated,
  onUpdate,
  isOnline = true,
  refreshCount,
  brainId,
  brains = [],
  canWrite = true,
  cryptoKey = null,
  onNavigate = null,
}: QuickCaptureProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  // Holds the full technical error string so it stays visible until the next save attempt.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedEntry | null>(null);
  const [listening, setListening] = useState(false);
  // Multi-brain: which brains to capture into (primary = first element)
  const [selectedBrainIds, setSelectedBrainIds] = useState(() => (brainId ? [brainId] : []));
  const [multiPreview, setMultiPreview] = useState<ParsedEntry[] | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const [bulkFiles, setBulkFiles] = useState<File[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const connectionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastConnectionsLengthRef = useRef<number>(entries ? entries.length : 0);
  const isBulkImportingRef = useRef<boolean>(false);

  // Keep selection in sync when active brain changes
  useEffect(() => {
    if (brainId) setSelectedBrainIds((prev) => (prev.includes(brainId) ? prev : [brainId]));
  }, [brainId]);

  const primaryBrainId = selectedBrainIds[0] || brainId;
  const extraBrainIds = selectedBrainIds.slice(1);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!isOnline) {
      setStatus("offline-image");
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setStatus("img-too-large");
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    setLoading(true);
    setStatus("thinking");
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      // CODE-8: intentional — direct call needed for vision/image processing (multipart content array not supported by callAI wrapper)
      const apiRes = await aiFetch("/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: getUserModel(),
          max_tokens: 600,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
                {
                  type: "text",
                  text: "Extract all text from this image. Output just the extracted content, clean and readable. If it's a business card, document, label, or receipt — preserve structure. No commentary.",
                },
              ],
            },
          ],
        }),
      });
      const data = await apiRes.json();
      const extracted = data.content?.[0]?.text?.trim() || "";
      if (extracted) setText(extracted);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
    setStatus(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!isOnline) {
      setStatus("offline-image");
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    if (!isSupportedFile(file)) {
      setStatus("unsupported-file");
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus("file-too-large");
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    setLoading(true);
    setStatus("reading-file");

    try {
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
                  {
                    type: "text",
                    text: "Extract ALL text from this document. Preserve structure, headings, lists. Output just the extracted content, clean and readable. No commentary.",
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
        setStatus("file-empty");
        setTimeout(() => setStatus(null), 3000);
        setLoading(false);
        return;
      }

      // Check if content should be split into multiple entries
      if (shouldSplitContent(extractedText)) {
        setStatus("splitting");
        const brainType = brains.find((b) => b.id === primaryBrainId)?.type || "personal";
        const splitRes = await callAI({
          max_tokens: 4000,
          system: PROMPTS.FILE_SPLIT,
          brainId: primaryBrainId,
          messages: [{ role: "user", content: buildSplitPrompt(extractedText, brainType) }],
        });
        const splitData = await splitRes.json();
        const raw = splitData.content?.[0]?.text || "[]";
        const entries = parseAISplitResponse(raw);

        if (entries.length > 1) {
          // Show multi-entry preview
          setLoading(false);
          setStatus(null);
          setMultiPreview(entries as ParsedEntry[]);
          return;
        } else if (entries.length === 1) {
          // Single entry — show normal preview
          setLoading(false);
          setStatus(null);
          setPreview({ ...entries[0], _raw: extractedText });
          return;
        }
      }

      // Fallback: use normal capture flow with extracted text
      setText(extractedText);
    } catch (err) {
      console.error("[fileUpload] error:", err);
      setStatus("error");
    }
    setLoading(false);
    setTimeout(() => setStatus(null), 3000);
  };

  const saveMultiEntries = async (entriesToSave: ParsedEntry[]) => {
    setMultiPreview(null);
    setLoading(true);
    setStatus("saving");
    isBulkImportingRef.current = true;
    let savedCount = 0;
    for (const parsed of entriesToSave) {
      try {
        const captureHeaders = {
          "Content-Type": "application/json",
          ...(parsed.type !== "secret" ? getEmbedHeaders() || {} : {}),
        };
        const rpcRes = await authFetch("/api/capture", {
          method: "POST",
          headers: captureHeaders,
          body: JSON.stringify({
            p_title: parsed.title,
            p_content: parsed.content || "",
            p_type: parsed.type || "note",
            p_metadata: parsed.metadata || {},
            p_tags: parsed.tags || [],
            p_brain_id: primaryBrainId,
            p_extra_brain_ids: extraBrainIds,
          }),
        });
        if (rpcRes.ok) {
          const result = await rpcRes.json();
          // Client-side embed: more reliable than server fire-and-forget
          if (result?.id && parsed.type !== "secret") {
            const embedHeaders = getEmbedHeaders();
            if (embedHeaders) {
              authFetch("/api/embed", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...embedHeaders },
                body: JSON.stringify({ entry_id: result.id }),
              }).catch(() => {});
            }
          }
          const multiType = parsed.type || "note";
          const multiIcon = parsed.icon || pickDefaultIcon(multiType);
          registerTypeIcon(primaryBrainId, multiType, multiIcon);
          const newEntry = {
            id: result?.id || Date.now().toString() + savedCount,
            ...parsed,
            type: multiType,
            pinned: false,
            importance: 0,
            tags: parsed.tags || [],
            created_at: new Date().toISOString(),
          };
          setEntries((prev) => [newEntry as Entry, ...prev]);
          onCreated?.(newEntry as Entry);
          savedCount++;
        } else {
          const errData = await rpcRes.json().catch(() => ({}));
          console.error(`[multiSave] entry "${parsed.title}" failed ${rpcRes.status}:`, errData);
        }
      } catch (err) {
        console.error("[multiSave] error:", err);
      }
    }
    isBulkImportingRef.current = false;
    setStatus(savedCount > 0 ? "saved-db" : "error");
    setLoading(false);
    setTimeout(() => setStatus(null), 3000);
  };

  // Whisper recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const _startSpeechRecognitionFallback = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR: (new () => any) | undefined = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setText((prev) => prev + " [Voice not supported in this browser]");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SR();
    recognition.lang = "en-ZA";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join("");
      setText(transcript);
      if (silenceTimer !== null) clearTimeout(silenceTimer);
      if (event.results[event.results.length - 1].isFinal) {
        silenceTimer = setTimeout(() => recognition.stop(), 2000);
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.start();
    setListening(true);
  }, [listening]);

  // Stop an active MediaRecorder recording and send to Whisper
  const stopWhisperRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    recorder.stop(); // triggers ondataavailable + onstop
  }, []);

  const startVoice = useCallback(async () => {
    // If already recording with Whisper, stop
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      stopWhisperRecording();
      return;
    }
    // If already using SpeechRecognition, stop
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const groqKey = getGroqKey();
    const openAIKey = getUserApiKey();
    const hasTranscription = !!groqKey || !!openAIKey;

    if (!hasTranscription) {
      // Fall back to browser SpeechRecognition
      _startSpeechRecognitionFallback();
      return;
    }

    // Use MediaRecorder + Whisper/Groq
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Determine supported MIME type — iOS only supports mp4/m4a
      let mimeType = "audio/mp4"; // safe default for iOS
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
        mimeType = "audio/webm;codecs=opus";
      else if (MediaRecorder.isTypeSupported("audio/webm")) mimeType = "audio/webm";
      else if (MediaRecorder.isTypeSupported("audio/mp4")) mimeType = "audio/mp4";
      else if (MediaRecorder.isTypeSupported("audio/aac")) mimeType = "audio/aac";
      else if (MediaRecorder.isTypeSupported("audio/mpeg")) mimeType = "audio/mpeg";

      const recorder = new MediaRecorder(
        stream,
        mimeType !== "audio/mp4" ? { mimeType } : undefined,
      );
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); // release mic
        setListening(false);

        // Use the recorder's actual mimeType (iOS may override what we requested)
        const actualMime = recorder.mimeType || mimeType;
        const blob = new Blob(audioChunksRef.current, { type: actualMime });
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;

        if (blob.size < 1000) return; // too short — skip

        setLoading(true);
        setStatus("thinking");
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const transcribeHeaders: Record<string, string> = { "Content-Type": "application/json" };
          if (groqKey) transcribeHeaders["X-Groq-Api-Key"] = groqKey;
          if (openAIKey) transcribeHeaders["X-User-Api-Key"] = openAIKey;
          const transcribeRes = await authFetch("/api/transcribe", {
            method: "POST",
            headers: transcribeHeaders,
            body: JSON.stringify({ audio: base64, mimeType: actualMime, language: "en" }),
          });

          if (transcribeRes.ok) {
            const { text } = await transcribeRes.json();
            if (text?.trim()) setText((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()));
          } else {
            console.warn("[Whisper] transcription failed:", transcribeRes.status);
            setText((prev) => prev + " [Transcription failed — try again]");
          }
        } catch (err) {
          console.error("[Whisper] error:", err);
          setText((prev) => prev + " [Voice error — check console]");
        }
        setLoading(false);
        setStatus(null);
      };

      recorder.start(1000); // timeslice 1s — ensures ondataavailable fires on iOS
      setListening(true);
    } catch (err: unknown) {
      const micErr = err as { message?: string; name?: string };
      console.warn("[Voice] mic error:", micErr.message);
      // Show error to user instead of silently failing
      if (micErr.name === "NotAllowedError" || micErr.name === "PermissionDeniedError") {
        setText((prev) => (prev ? prev : ""));
        setStatus("mic-denied");
        setTimeout(() => setStatus(null), 3000);
      } else {
        // Try browser speech recognition as last resort
        _startSpeechRecognitionFallback();
      }
    }
  }, [listening, _startSpeechRecognitionFallback, stopWhisperRecording]);

  const doSave = useCallback(
    async (parsed: ParsedEntry) => {
      // Track capture edits as learnings (compare AI original vs user's final)
      if (preview && primaryBrainId) {
        if (preview.type && parsed.type && preview.type !== parsed.type) {
          recordDecision(primaryBrainId, {
            source: "capture", type: "CAPTURE_TYPE", action: "edit",
            field: "type", originalValue: preview.type, finalValue: parsed.type,
          });
        }
        if (preview.title && parsed.title && preview.title !== parsed.title) {
          recordDecision(primaryBrainId, {
            source: "capture", type: "CAPTURE_TITLE", action: "edit",
            field: "title", originalValue: preview.title, finalValue: parsed.title,
          });
        }
        const origTags = (preview.tags || []).sort().join(",");
        const finalTags = (parsed.tags || []).sort().join(",");
        if (origTags !== finalTags) {
          recordDecision(primaryBrainId, {
            source: "capture", type: "CAPTURE_TAGS", action: "edit",
            field: "tags", originalValue: origTags, finalValue: finalTags,
          });
        }
      }
      setPreview(null);
      setLoading(true);
      setErrorDetail(null);
      setStatus("saving");
      try {
        if (parsed.title) {
          if (!isOnline) {
            showToast("You can't save while offline.", "error");
            setStatus(null);
            setLoading(false);
            return;
          }
          {
            // E2E: encrypt content & metadata for secret entries before sending to server
            const isSecret = (parsed.type || "note") === "secret";
            if (isSecret && !cryptoKey) {
              setStatus("vault-needed");
              setLoading(false);
              return;
            }
            let serverContent = parsed.content || "";
            let serverMetadata = parsed.metadata || {};
            if (isSecret && cryptoKey) {
              const encrypted = await encryptEntry(
                { content: serverContent, metadata: serverMetadata },
                cryptoKey,
              );
              serverContent = encrypted.content as string;
              serverMetadata = encrypted.metadata as Record<string, unknown>;
            }
            const captureHeaders = {
              "Content-Type": "application/json",
              ...(isSecret ? {} : getEmbedHeaders() || {}),
            };
            const rpcRes = await authFetch("/api/capture", {
              method: "POST",
              headers: captureHeaders,
              body: JSON.stringify({
                p_title: parsed.title,
                p_content: serverContent,
                p_type: parsed.type || "note",
                p_metadata: serverMetadata,
                p_tags: parsed.tags || [],
                p_brain_id: primaryBrainId,
                p_extra_brain_ids: extraBrainIds,
              }),
            });
            if (rpcRes.ok) {
              const result = await rpcRes.json();
              // Server-side auto-embed now runs (awaited) inside /api/capture when the
              // X-Embed-* headers are present. No client-side follow-up needed.
              const savedType = parsed.type || "note";
              const savedIcon = parsed.icon || pickDefaultIcon(savedType);
              registerTypeIcon(primaryBrainId, savedType, savedIcon);
              const newEntry = {
                id: result?.id || Date.now().toString(),
                title: parsed.title,
                content: parsed.content || "",
                type: savedType,
                metadata: parsed.metadata || {},
                pinned: false,
                importance: 0,
                tags: parsed.tags || [],
                created_at: new Date().toISOString(),
              };
              setEntries((prev) => [newEntry as Entry, ...prev]);
              onCreated?.(newEntry as Entry);
              if (result?.embed_error) {
                setErrorDetail(result.embed_error);
                setStatus("error");
              } else {
                setStatus("saved-db");
              }
              // PERF-6: debounce findConnections by 5 s; skip during bulk import
              // (heuristic: if entries grew by more than 3 since last run, it's a bulk import)
              const currentLength = entries.length;
              const delta = currentLength - lastConnectionsLengthRef.current;
              lastConnectionsLengthRef.current = currentLength + 1; // +1 for the entry being saved
              if (!isBulkImportingRef.current && delta <= 3) {
                if (connectionsTimerRef.current !== null) clearTimeout(connectionsTimerRef.current);
                const entrySnapshot = newEntry;
                const entriesSnapshot = entries;
                const linksSnapshot = links || [];
                connectionsTimerRef.current = setTimeout(() => {
                  findConnections(
                    entrySnapshot,
                    entriesSnapshot,
                    linksSnapshot,
                    primaryBrainId,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ).then((newLinks: any) => {
                    if (newLinks.length === 0) return;
                    addLinks?.(newLinks);
                    authFetch("/api/save-links", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ links: newLinks }),
                    }).catch((err) =>
                      console.error("[QuickCapture:findConnections] Failed to save links", err),
                    );
                  });
                }, 5000);
              }
            } else {
              const errBody = await rpcRes.text().catch(() => "(no body)");
              const errMsg = `[doSave] HTTP ${rpcRes.status} — ${errBody}`;
              console.error(errMsg);
              setErrorDetail(errMsg);
              setStatus("error");
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const errMsg = `[doSave] exception: ${msg}`;
        console.error(errMsg);
        setErrorDetail(errMsg);
        setStatus("error");
      }
      setLoading(false);
      // Errors stay visible until the next save attempt; only clear success states.
      setTimeout(() => setStatus((s) => s !== "error" ? null : s), 3000);
    },
    [
      entries,
      links,
      addLinks,
      onCreated,
      setEntries,
      isOnline,
      refreshCount,
      primaryBrainId,
      extraBrainIds,
    ],
  );

  const capture = async () => {
    if (!text.trim()) return;
    const input = text.trim();
    setText("");
    setLoading(true);
    setErrorDetail(null);
    setStatus("thinking");
    if (!isOnline) {
      showToast("You can't save while offline.", "error");
      setText(input);
      setLoading(false);
      setStatus(null);
      return;
    }
    try {
      const res = await callAI({
        system: PROMPTS.CAPTURE,
        max_tokens: 800,
        brainId: primaryBrainId,
        messages: [{ role: "user", content: input }],
      });
      const data = await res.json();
      let parsed: ParsedEntry = {};
      try {
        parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
      } catch {}
      if (parsed.title) {
        setLoading(false);
        setStatus(null);
        setPreview({ ...parsed, _raw: input });
        return;
      }
      // AI returned no parseable title — save raw entry directly to DB so it
      // persists across refreshes and gets embedded like any other capture.
      setStatus("saving");
      const rawTitle = input.slice(0, 500).trim() || "Untitled";
      const captureHeaders = {
        "Content-Type": "application/json",
        ...(getEmbedHeaders() || {}),
      };
      const rpcRes = await authFetch("/api/capture", {
        method: "POST",
        headers: captureHeaders,
        body: JSON.stringify({
          p_title: rawTitle,
          p_content: input,
          p_type: "note",
          p_metadata: {},
          p_tags: [],
          p_brain_id: primaryBrainId,
          p_extra_brain_ids: extraBrainIds,
        }),
      });
      if (rpcRes.ok) {
        const result = await rpcRes.json();
        const newEntry = {
          id: result?.id || Date.now().toString(),
          title: rawTitle,
          content: input,
          type: "note",
          metadata: {},
          pinned: false,
          importance: 0,
          tags: [],
          created_at: new Date().toISOString(),
        };
        setEntries((prev) => [newEntry as Entry, ...prev]);
        onCreated?.(newEntry as Entry);
        if (result?.embed_error) {
          setErrorDetail(result.embed_error);
          setStatus("error");
        } else {
          setStatus("saved-db");
        }
      } else {
        const errBody = await rpcRes.text().catch(() => "(no body)");
        const errMsg = `[capture:raw] HTTP ${rpcRes.status} — ${errBody}`;
        console.error(errMsg);
        setErrorDetail(errMsg);
        setText(input);
        setStatus("error");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const errMsg = `[capture] exception: ${msg}`;
      console.error(errMsg);
      setErrorDetail(errMsg);
      setText(input);
      setStatus("error");
    }
    setLoading(false);
    setTimeout(() => setStatus((s) => s !== "error" ? null : s), 3000);
  };

  const statusMsg = {
    thinking: "🤖 Parsing...",
    saving: "💾 Saving...",
    "saved-db": "✅ Saved & synced!",
    "saved-local": "📡 Saved — will sync when online",
    "saved-raw": "📝 Saved",
    error: "⚠️ Failed to save — please try again",
    "offline-image": "📵 Uploads need a connection",
    "img-too-large": "⚠️ Photo too large — try a smaller image",
    "file-too-large": "⚠️ File too large — max 10MB",
    "unsupported-file": "⚠️ Unsupported file type — use .txt, .md, .csv, .pdf, or .docx",
    "reading-file": "📄 Reading file...",
    splitting: "✂️ Splitting into entries...",
    "file-empty": "⚠️ Could not extract text from file",
    "vault-needed": "🔐 Set up your Vault first to save secrets",
    "mic-denied": "🎤 Microphone access denied — check your browser/phone settings",
  };

  if (!canWrite) {
    return (
      <div className="px-4 pt-3 pb-2">
        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-3 border"
          style={{ background: "var(--color-surface-container-low)", borderColor: "var(--color-outline-variant)" }}
        >
          <span>🔒</span>
          <span className="text-sm text-on-surface-variant">You have view-only access to this brain</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-3 pb-2">
      {/* Capture input bar */}
      <div
        className="flex items-center gap-2 rounded-2xl px-4 py-3.5 border transition-colors focus-within:border-[var(--color-primary)]"
        style={{
          background: "var(--color-surface-container)",
          borderColor: "var(--color-outline-variant)",
        }}
      >
        {/* Hidden file inputs */}
        <input type="file" accept="image/*" ref={imgRef} onChange={handleImageUpload} className="hidden" />
        <input
          type="file"
          accept={ACCEPT_STRING}
          ref={fileRef}
          onChange={handleFileUpload}
          className="hidden"
        />
        <input
          type="file"
          accept={ACCEPT_STRING}
          multiple
          ref={bulkFileRef}
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (files.length > 0) setBulkFiles(files);
          }}
          className="hidden"
        />

        {/* Text input */}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && capture()}
          disabled={loading}
          placeholder={
            listening
              ? "Listening..."
              : loading
                ? "Processing..."
                : "Quick capture — just type anything..."
          }
          name="quick-capture"
          type="text"
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent text-on-surface text-base outline-none placeholder:text-on-surface-variant/40 px-4 py-3"
        />

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Voice */}
          <button
            onClick={startVoice}
            disabled={loading}
            title={listening ? "Stop recording" : "Voice capture"}
            aria-label={listening ? "Stop recording" : "Voice capture"}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
            style={listening ? { background: "color-mix(in oklch, var(--color-error) 15%, transparent)", color: "var(--color-error)" } : { color: "var(--color-on-surface-variant)" }}
          >
            {listening ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
            )}
          </button>
          {/* Camera */}
          <button
            onClick={() => imgRef.current?.click()}
            disabled={loading}
            title="Photo capture"
            aria-label="Photo capture"
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
          </button>
          {/* File upload */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            title="Upload file"
            aria-label="Upload file (PDF, Word, MD, TXT)"
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          </button>
          {/* Bulk upload */}
          <button
            onClick={() => bulkFileRef.current?.click()}
            disabled={loading}
            title="Bulk upload"
            aria-label="Bulk upload multiple files"
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
            style={{ color: "var(--color-on-surface-variant)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
          </button>
          <button
            onClick={capture}
            disabled={loading || !text.trim()}
            title={`Save to ${(BRAIN_META_QC[brains[0]?.type as keyof typeof BRAIN_META_QC] ?? BRAIN_META_QC.personal).emoji} ${brains[0]?.name || "brain"}`}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-lg font-bold transition-all disabled:opacity-30"
            style={{
              background: text.trim() ? "var(--color-primary)" : "var(--color-surface-container-highest)",
              color: text.trim() ? "var(--color-on-primary)" : "var(--color-on-surface-variant)",
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Status message */}
      {status && (
        <div className="mt-2 px-1">
          <p className="text-xs font-mono break-all" style={{ color: status === "error" || status.includes("large") || status.includes("unsupported") ? "var(--color-error)" : "var(--color-primary)" }}>
            {status === "error" && errorDetail ? errorDetail : (status ? statusMsg[status] : null)}
          </p>
          {status === "vault-needed" && onNavigate && (
            <button
              onClick={() => {
                onNavigate("vault");
                setStatus(null);
              }}
              className="text-xs font-semibold mt-1 px-3 py-1 rounded-lg transition-colors"
              style={{ color: "var(--color-primary)", background: "var(--color-primary-container)" }}
            >
              Open Vault
            </button>
          )}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <PreviewModal
          preview={preview}
          entries={entries}
          onSave={doSave}
          onUpdate={onUpdate ?? (() => {})}
          onCancel={() => setPreview(null)}
        />
      )}

      {/* Bulk upload modal */}
      {bulkFiles && (
        <BulkUploadModal
          files={bulkFiles}
          brainId={primaryBrainId}
          brains={brains}
          onCreated={(entry) => {
            setEntries((prev) => [entry as Entry, ...prev]);
            onCreated?.(entry as Entry);
          }}
          onDone={(totalSaved) => {
            setBulkFiles(null);
            if (totalSaved > 0) {
              setStatus("saved-db");
              setTimeout(() => setStatus(null), 3000);
            }
          }}
          onCancel={() => setBulkFiles(null)}
        />
      )}

      {/* Multi-entry preview modal */}
      {multiPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 pt-4"
          style={{
            background: "var(--color-scrim)",
            backdropFilter: "blur(4px)",
            // Push the modal clear of the floating bottom nav (bottom-5 + ~56px tall)
            // plus iOS safe-area inset so it never hides behind the nav on any device
            paddingBottom: "calc(env(safe-area-inset-bottom) + 96px)",
          }}
          onClick={() => setMultiPreview(null)}
        >
          <div
            className="w-full max-w-lg flex flex-col rounded-2xl border"
            style={{ background: "var(--color-surface-dim)", borderColor: "var(--color-outline-variant)", maxHeight: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fixed header */}
            <div className="px-5 pt-5 pb-3 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-on-surface">✂️ {multiPreview.length} entries found in file</span>
                <button onClick={() => setMultiPreview(null)} className="text-on-surface-variant hover:text-on-surface text-lg">✕</button>
              </div>
              <p className="text-xs text-on-surface-variant">
                Review the entries extracted from your file. Remove any you don't want, then save all.
              </p>
            </div>
            {/* Scrollable entries list */}
            <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-3">
              {multiPreview.map((entry, i) => (
                <div
                  key={i}
                  className="relative rounded-xl border p-3"
                  style={{ background: "var(--color-surface-container)", borderColor: "var(--color-outline-variant)" }}
                >
                  <button
                    onClick={() => setMultiPreview((prev) => (prev ?? []).filter((_, j) => j !== i))}
                    title="Remove"
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                  >
                    ✕
                  </button>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-on-surface truncate">{entry.title}</span>
                    <span className="text-[10px] uppercase tracking-wider text-on-surface-variant ml-auto mr-6">{entry.type}</span>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {(entry.content || "").slice(0, 150)}
                    {(entry.content || "").length > 150 ? "…" : ""}
                  </p>
                  {(entry.tags?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(entry.tags ?? []).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ color: "var(--color-primary)", background: "var(--color-primary-container)" }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Fixed action buttons — always visible above bottom nav */}
            <div className="flex gap-3 px-5 py-4 flex-shrink-0 border-t" style={{ borderColor: "var(--color-outline-variant)" }}>
              <button
                onClick={() => setMultiPreview(null)}
                className="flex-1 py-2.5 rounded-xl border text-sm text-on-surface-variant transition-colors hover:bg-white/5"
                style={{ borderColor: "var(--color-outline-variant)", background: "transparent" }}
              >
                Cancel
              </button>
              <button
                onClick={() => saveMultiEntries(multiPreview)}
                disabled={multiPreview.length === 0}
                className="flex-[2] py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
                style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
              >
                Save {multiPreview.length} entries
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
