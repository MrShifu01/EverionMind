import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { BrainTypeIcon } from "../components/icons/BrainTypeIcon";
import { authFetch } from "../lib/authFetch";
import { callAI } from "../lib/ai";
import { PC } from "../data/constants";
import { PROMPTS } from "../config/prompts";
import { aiFetch } from "../lib/aiFetch";
import { getUserModel, getEmbedHeaders, getGroqKey, getUserApiKey } from "../lib/aiSettings";
import { useAiQuestion } from "../hooks/useAiQuestion";
import {
  isSupportedFile,
  isTextFile,
  isDocxFile,
  isExcelFile,
  readTextFile,
  readDocxFile,
  readExcelFile,
  readFileAsBase64,
  ACCEPT_STRING,
} from "../lib/fileParser";
import BulkUploadModal from "../components/BulkUploadModal";
import type { Entry, Brain, Suggestion, Priority } from "../types";

interface SuggestionsViewProps {
  entries: Entry[];
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  activeBrain: Brain | null;
  brains: Brain[];
}

interface AiQuestion {
  q: string;
  cat: string;
  p: string;
  ai?: boolean;
}

interface SavedItem {
  q: string;
  a: string;
  cat: string;
  db: boolean;
  brain: Brain | null;
}

/* ─── Brain type label/icon ─── */
const BRAIN_META = {
  personal: { label: "Personal" },
  family: { label: "Family" },
  business: { label: "Business" },
};

export default function SuggestionsView({
  entries,
  setEntries,
  activeBrain,
  brains,
}: SuggestionsViewProps) {
  const targetBrain = activeBrain;
  const brainType = targetBrain?.type || "personal";

  const [answer, setAnswer] = useState("");
  const [answered, setAnswered] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [showInput, setShowInput] = useState(false);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [, setAnim] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Answered tracking — shared key merges all brain types
  const answeredKey = "openbrain_answered_qs";
  const [answeredQs, setAnsweredQs] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(answeredKey) || "[]"));
    } catch {
      return new Set<string>();
    }
  });

  // Reset counters when active brain changes
  useEffect(() => {
    setAnswered(0);
    setSkipped(0);
  }, [activeBrain?.id]);

  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const [bulkFiles, setBulkFiles] = useState<File[] | null>(null);

  // Skipped onboarding questions — shown first before AI questions
  const [onboardingSkipped] = useState<Suggestion[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("openbrain_onboarding_skipped") || "[]");
    } catch {
      return [];
    }
  });

  const skippedQueue = useMemo((): Suggestion[] => {
    return onboardingSkipped.filter((s: Suggestion) => !answeredQs.has(s.q));
  }, [answeredQs, onboardingSkipped]);

  // Always AI-driven: show onboarding skipped first, then pure AI questions
  const useSkipped = skippedQueue.length > 0;

  const { aiQuestion, aiLoading, generateAiQuestion } = useAiQuestion({
    entries,
    answeredQs,
    brainType,
    targetBrainId: targetBrain?.id,
    activeBrainId: activeBrain?.id,
    useSkipped,
  });

  const current: AiQuestion | Suggestion | null = useSkipped
    ? skippedQueue[0]
    : aiLoading
      ? null
      : aiQuestion;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 4 * 1024 * 1024) {
      setImgError("Photo too large — try a smaller image");
      setTimeout(() => setImgError(null), 3000);
      return;
    }
    setImgLoading(true);
    setImgError(null);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
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
                  text: "Extract all text from this image relevant to the question. Output just the extracted content, clean and readable. If it's a document, card, or label — preserve structure. No commentary.",
                },
              ],
            },
          ],
        }),
      });
      const data = await apiRes.json();
      const extracted = data.content?.[0]?.text?.trim() || "";
      if (extracted) {
        setAnswer(extracted);
      } else {
        setImgError("Could not extract text — try a clearer photo");
        setTimeout(() => setImgError(null), 3000);
      }
    } catch (err) {
      console.error(err);
      setImgError("Photo upload failed — check your connection");
      setTimeout(() => setImgError(null), 3000);
    }
    setImgLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!isSupportedFile(file)) {
      setImgError("Unsupported file — use .txt, .md, .csv, .pdf, or .docx");
      setTimeout(() => setImgError(null), 3000);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImgError("File too large — max 10MB");
      setTimeout(() => setImgError(null), 3000);
      return;
    }
    setImgLoading(true);
    setImgError(null);
    try {
      let extractedText = "";
      if (isTextFile(file)) {
        extractedText = await readTextFile(file);
      } else if (isDocxFile(file)) {
        extractedText = await readDocxFile(file);
      } else if (isExcelFile(file)) {
        extractedText = await readExcelFile(file);
      } else {
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
                    text: "Extract ALL text from this document relevant to the question. Preserve structure. No commentary.",
                  },
                ],
              },
            ],
          }),
        });
        const data = await apiRes.json();
        extractedText = data.content?.[0]?.text?.trim() || "";
      }
      if (extractedText) {
        setAnswer(extractedText);
      } else {
        setImgError("Could not extract text from file");
        setTimeout(() => setImgError(null), 3000);
      }
    } catch (err) {
      console.error(err);
      setImgError("File upload failed — check your connection");
      setTimeout(() => setImgError(null), 3000);
    }
    setImgLoading(false);
  };

  const startVoice = useCallback(async () => {
    // If already recording, stop
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const groqKey = getGroqKey();
    const openAIKey = getUserApiKey();
    const hasTranscription = !!groqKey || !!openAIKey;

    if (!hasTranscription) {
      // Fall back to browser SpeechRecognition
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        setMicError("Voice not supported in this browser");
        setTimeout(() => setMicError(null), 3000);
        return;
      }
      const recognition = new SR();
      recognition.lang = "en-ZA";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognitionRef.current = recognition;
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join("");
        setAnswer(transcript);
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
      return;
    }

    // Use MediaRecorder + Whisper/Groq
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = "audio/mp4";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
        mimeType = "audio/webm;codecs=opus";
      else if (MediaRecorder.isTypeSupported("audio/webm")) mimeType = "audio/webm";

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
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const actualMime = recorder.mimeType || mimeType;
        const blob = new Blob(audioChunksRef.current, { type: actualMime });
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        if (blob.size < 1000) return;

        setImgLoading(true);
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
            const {
              text,
              audioBytes,
              provider: txProvider,
              model: txModel,
            } = await transcribeRes.json();
            if (text?.trim()) setAnswer((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()));
            if (audioBytes) {
              import("../lib/usageTracker")
                .then((m) => {
                  m.recordUsage({
                    date: new Date().toISOString().slice(0, 10),
                    type: "transcription",
                    provider: txProvider || "groq",
                    model: txModel || "whisper-large-v3-turbo",
                    audioBytes,
                  });
                })
                .catch((err) =>
                  console.error("[SuggestionsView] recordUsage (transcription) failed", err),
                );
            }
          } else {
            setMicError("Transcription failed — try again");
            setTimeout(() => setMicError(null), 3000);
          }
        } catch (err) {
          console.error("[Voice] error:", err);
          setMicError("Voice error — check console");
          setTimeout(() => setMicError(null), 3000);
        }
        setImgLoading(false);
      };

      recorder.start(1000);
      setListening(true);
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMicError("Microphone access denied — check settings");
        setTimeout(() => setMicError(null), 3000);
      } else {
        setMicError("Microphone not available");
        setTimeout(() => setMicError(null), 3000);
      }
    }
  }, [listening]);

  const next = useCallback(
    (dir: string) => {
      setAnim(dir);
      setTimeout(() => {
        setAnswer("");
        setShowInput(false);
        setAnim("");
        // Generate next AI question after a short delay so state clears first
        setTimeout(() => generateAiQuestion(), 50);
      }, 200);
    },
    [generateAiQuestion],
  );

  const handleSave = async () => {
    if (!answer.trim()) return;
    const a = answer.trim();
    setSaving(true);
    setSaveError(null);
    try {
      // Step 1: AI classification
      let aiRes: Response;
      try {
        aiRes = await callAI({
          max_tokens: 800,
          system: PROMPTS.QA_PARSE,
          brainId: targetBrain?.id,
          messages: [{ role: "user", content: `Question: ${current!.q}\nAnswer: ${a}` }],
        });
      } catch (err: any) {
        const msg = `[QA_PARSE:ai] ${err?.message || String(err)}`;
        console.error(msg);
        setSaveError(msg);
        setSaving(false);
        return;
      }

      const aiData = await aiRes.json();
      let parsedRaw: any = {};
      try {
        parsedRaw = JSON.parse(
          (aiData.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim(),
        );
      } catch (err: any) {
        const msg = `[QA_PARSE:json] ${err?.message || String(err)} — raw: ${(aiData.content?.[0]?.text || "").slice(0, 200)}`;
        console.error(msg);
        setSaveError(msg);
        setSaving(false);
        return;
      }

      // Normalise to array
      const parsedEntries: any[] = Array.isArray(parsedRaw) ? parsedRaw : [parsedRaw];

      // Fall back to raw answer if AI produced no title on the first entry
      if (parsedEntries.length === 1 && !parsedEntries[0].title) {
        parsedEntries[0].title = a.slice(0, 60);
        parsedEntries[0].content = parsedEntries[0].content || a;
        parsedEntries[0].type = parsedEntries[0].type || "note";
      }

      // Step 2: Save each entry to DB with embed headers
      for (const parsed of parsedEntries) {
        const rpcRes = await authFetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(getEmbedHeaders() || {}) },
          body: JSON.stringify({
            p_title: parsed.title,
            p_content: parsed.content || a,
            p_type: parsed.type || "note",
            p_metadata: parsed.metadata || {},
            p_tags: parsed.tags || [],
            p_brain_id: targetBrain?.id,
          }),
        });

        if (!rpcRes.ok) {
          const errBody = await rpcRes.text().catch(() => "(no body)");
          const msg = `[capture] HTTP ${rpcRes.status} — ${errBody}`;
          console.error(msg);
          setSaveError(msg);
          continue;
        }

        let captureData: any = {};
        try {
          captureData = await rpcRes.json();
        } catch (err) { console.error("[SuggestionsView]", err); }
        if (captureData.embed_error) {
          console.error(`[embed] ${captureData.embed_error}`);
        }

        const newEntry: Entry = {
          id: captureData.id || String(Date.now()),
          ...parsed,
          pinned: false,
          importance: 0,
          tags: parsed.tags || [],
          created_at: new Date().toISOString(),
        };
        setEntries((prev: Entry[]) => [newEntry, ...prev]);
      }
      setSaved((prev: SavedItem[]) => [
        { q: current!.q, a, cat: current!.cat, db: true, brain: targetBrain },
        ...prev,
      ]);
    } catch (err: any) {
      const msg = `[handleSave] ${err?.message || String(err)}`;
      console.error(msg);
      setSaveError(msg);
      setSaved((prev: SavedItem[]) => [
        { q: current!.q, a, cat: current!.cat, db: false, brain: targetBrain },
        ...prev,
      ]);
    }

    if (useSkipped && current?.q) {
      setAnsweredQs((prev) => {
        const updated = new Set(prev);
        updated.add(current.q);
        try {
          localStorage.setItem(answeredKey, JSON.stringify([...updated]));
        } catch (err) { console.error("[SuggestionsView]", err); }
        return updated;
      });
      // Remove from skipped onboarding list if it was there
      try {
        const skipped = JSON.parse(localStorage.getItem("openbrain_onboarding_skipped") || "[]");
        const updated = skipped.filter((s: any) => s.q !== current!.q);
        localStorage.setItem("openbrain_onboarding_skipped", JSON.stringify(updated));
      } catch (err) { console.error("[SuggestionsView]", err); }
    }

    setSaving(false);
    setAnswered((n) => n + 1);
    next("save");
  };

  const pc = current ? PC[current.p as Priority] || PC.medium : PC.medium;
  const bm = BRAIN_META[brainType as keyof typeof BRAIN_META] || BRAIN_META.personal;

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Active brain indicator */}
      {targetBrain && (
        <div>
          <p className="text-on-surface-variant text-xs">
            Showing questions for{" "}
            <strong className="text-on-surface">
              <BrainTypeIcon type={brainType} className="inline h-3.5 w-3.5 align-middle" />{" "}
              {targetBrain.name}
            </strong>
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { l: "Answered", v: answered, color: "var(--color-primary)" },
          { l: "Skipped", v: skipped, color: "var(--color-on-surface-variant)" },
        ].map((s) => (
          <div
            key={s.l}
            className="rounded-xl border px-3 py-2.5 text-center"
            style={{
              background: "var(--color-surface-container)",
              borderColor: "var(--color-outline-variant)",
            }}
          >
            <div className="text-xl font-bold" style={{ color: s.color }}>
              {s.v}
            </div>
            <div className="text-on-surface-variant text-[10px] font-semibold tracking-widest uppercase">
              {s.l}
            </div>
          </div>
        ))}
      </div>

      {/* AI loading state */}
      {aiLoading && (
        <div
          className="rounded-2xl border px-4 py-6 text-center"
          style={{
            background: "var(--color-secondary-container)",
            borderColor: "var(--color-secondary)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--color-secondary)" }}>
            Thinking of a question…
          </p>
        </div>
      )}

      {/* Current question card */}
      {current && !aiLoading && (
        <div
          className="rounded-2xl border px-4 py-4"
          style={{
            background: "var(--color-surface-container)",
            borderColor: "var(--color-outline-variant)",
          }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase"
              style={{
                color:
                  pc.l === "High"
                    ? "var(--color-error)"
                    : pc.l === "Medium"
                      ? "var(--color-status-medium)"
                      : "var(--color-primary)",
                background:
                  pc.l === "High"
                    ? "color-mix(in oklch, var(--color-error) 12%, transparent)"
                    : pc.l === "Medium"
                      ? "var(--color-status-medium-container)"
                      : "var(--color-primary-container)",
              }}
            >
              {pc.l}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                color: "var(--color-secondary)",
                background: "var(--color-secondary-container)",
              }}
            >
              {current.cat}
            </span>
            {useSkipped ? (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  color: "var(--color-status-medium)",
                  background: "var(--color-status-medium-container)",
                }}
              >
                ↩ From onboarding
              </span>
            ) : (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  color: "var(--color-primary)",
                  background: "var(--color-primary-container)",
                }}
              >
                AI
              </span>
            )}
            <span className="text-on-surface-variant ml-auto text-[10px]">
              #{answered + skipped + 1}
            </span>
          </div>
          <p className="text-on-surface text-base leading-relaxed font-medium">{current.q}</p>
        </div>
      )}

      {/* Action buttons / Answer input */}
      {!showInput ? (
        <div className="flex gap-3">
          <button
            onClick={() => {
              setSkipped((s) => s + 1);
              next("skip");
            }}
            disabled={aiLoading}
            className="text-on-surface-variant flex-1 rounded-xl border py-3 text-sm font-medium transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ borderColor: "var(--color-outline-variant)", background: "transparent" }}
          >
            Skip →
          </button>
          <button
            onClick={() => setShowInput(true)}
            disabled={!current || aiLoading}
            className="flex-[2] rounded-xl py-3 text-sm font-bold transition-colors disabled:opacity-40"
            style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          >
            Answer this
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Hidden file inputs */}
          <input
            type="file"
            accept="image/*"
            ref={imgRef}
            onChange={handleImageUpload}
            className="hidden"
          />
          <input
            type="file"
            accept={ACCEPT_STRING}
            ref={fileRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <input
            type="file"
            multiple
            accept={ACCEPT_STRING}
            ref={bulkFileRef}
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = "";
              if (files.length > 0) setBulkFiles(files);
            }}
            className="hidden"
          />
          {imgError && <p className="text-error text-xs">{imgError}</p>}
          {micError && <p className="text-error text-xs">{micError}</p>}
          {saveError && (
            <p className="font-mono text-xs break-all" style={{ color: "var(--color-error)" }}>
              {saveError}
            </p>
          )}
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={listening ? "Listening..." : "Type your answer..."}
            autoFocus
            rows={3}
            className="text-on-surface placeholder:text-on-surface-variant w-full resize-none rounded-xl border bg-transparent px-3 py-3 text-sm transition-colors outline-none focus:border-[var(--color-primary)]"
            style={{
              borderColor: "var(--color-outline-variant)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowInput(false);
                setAnswer("");
                setListening(false);
                recognitionRef.current?.stop();
                mediaRecorderRef.current?.state !== "inactive" && mediaRecorderRef.current?.stop();
              }}
              className="text-on-surface-variant rounded-xl border px-3 py-2 text-xs transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--color-outline-variant)", background: "transparent" }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setSkipped((s) => s + 1);
                next("skip");
              }}
              className="text-on-surface-variant rounded-xl border px-3 py-2 text-xs transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--color-outline-variant)", background: "transparent" }}
            >
              Skip
            </button>
            <div className="ml-auto flex items-center gap-1">
              {/* Voice */}
              <button
                onClick={startVoice}
                disabled={imgLoading || saving}
                title={listening ? "Stop recording" : "Voice input"}
                aria-label={listening ? "Stop recording" : "Voice input"}
                className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
                style={
                  listening
                    ? {
                        background: "color-mix(in oklch, var(--color-error) 15%, transparent)",
                        color: "var(--color-error)",
                      }
                    : { color: "var(--color-on-surface-variant)" }
                }
              >
                {listening ? (
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                    />
                  </svg>
                )}
              </button>
              {/* Camera */}
              <button
                onClick={() => imgRef.current?.click()}
                disabled={imgLoading || saving}
                title="Upload photo"
                aria-label="Upload photo"
                className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
                  />
                </svg>
              </button>
              {/* File upload */}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={imgLoading || saving}
                title="Upload file (PDF, Word, MD, TXT)"
                aria-label="Upload file"
                className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
              </button>
              {/* Bulk upload */}
              <button
                onClick={() => bulkFileRef.current?.click()}
                disabled={imgLoading || saving}
                title="Bulk upload multiple files"
                aria-label="Bulk upload"
                className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-40"
                style={{ color: "var(--color-on-surface-variant)" }}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                  />
                </svg>
              </button>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={!answer.trim() || saving || imgLoading}
            className="w-full rounded-xl py-3 text-sm font-bold transition-colors disabled:opacity-40"
            style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          >
            {saving
              ? "Saving..."
              : imgLoading
                ? "Processing..."
                : listening
                  ? "Listening..."
                  : `Save to ${targetBrain?.name || bm.label}`}
          </button>
        </div>
      )}

      {/* Bulk upload modal */}
      {bulkFiles && activeBrain && (
        <BulkUploadModal
          files={bulkFiles}
          brainId={activeBrain.id}
          brains={brains}
          onCreated={(entry) => setEntries((prev) => [entry as Entry, ...prev])}
          onDone={() => setBulkFiles(null)}
          onCancel={() => setBulkFiles(null)}
        />
      )}

      {/* Session history */}
      {saved.length > 0 && (
        <div className="mt-4">
          <div className="mb-3 flex items-center">
            <p className="text-on-surface-variant text-xs font-semibold tracking-widest uppercase">
              This session ({saved.length})
            </p>
          </div>
          <div className="space-y-2">
            {saved.map((s, i) => (
              <div
                key={i}
                className="rounded-xl border px-3 py-2.5"
                style={{
                  background: "var(--color-surface-container-low)",
                  borderColor: "var(--color-outline-variant)",
                }}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      color: "var(--color-secondary)",
                      background: "var(--color-secondary-container)",
                    }}
                  >
                    {s.cat}
                  </span>
                  {s.brain && (
                    <span className="text-on-surface-variant text-[10px]">
                      <BrainTypeIcon type={s.brain.type ?? "personal"} className="inline h-3 w-3 align-middle" />{" "}
                      {s.brain.name}
                    </span>
                  )}
                  {s.db && (
                    <span
                      className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        color: "var(--color-primary)",
                        background: "var(--color-primary-container)",
                      }}
                    >
                      Saved
                    </span>
                  )}
                </div>
                <p className="text-on-surface-variant text-xs leading-relaxed">
                  {s.a.slice(0, 120)}
                  {s.a.length > 120 ? "…" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
