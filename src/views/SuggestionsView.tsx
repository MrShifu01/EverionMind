import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { authFetch } from "../lib/authFetch";
import { callAI } from "../lib/ai";
import { SUGGESTIONS } from "../data/personalSuggestions";
import { FAMILY_SUGGESTIONS } from "../data/familySuggestions";
import { BUSINESS_SUGGESTIONS } from "../data/businessSuggestions";
import { PC } from "../data/constants";
import { PROMPTS } from "../config/prompts";
import { aiFetch } from "../lib/aiFetch";
import { getUserModel, getEmbedHeaders, getGroqKey, getUserApiKey } from "../lib/aiSettings";
import { isSupportedFile, isTextFile, isDocxFile, isExcelFile, readTextFile, readDocxFile, readExcelFile, readFileAsBase64, ACCEPT_STRING } from "../lib/fileParser";
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

/* ─── Brain-type → question set ─── */
function getSuggestionsForType(type: string | undefined): Suggestion[] {
  if (type === "family") return FAMILY_SUGGESTIONS;
  if (type === "business") return BUSINESS_SUGGESTIONS;
  return SUGGESTIONS;
}

/* ─── Brain type label/icon ─── */
const BRAIN_META = {
  personal: { emoji: "🧠", label: "Personal" },
  family: { emoji: "🏠", label: "Family" },
  business: { emoji: "🏪", label: "Business" },
};

export default function SuggestionsView({
  entries,
  setEntries,
  activeBrain,
  brains,
}: SuggestionsViewProps) {
  // Multi-select: which brains to pull questions from (default = [activeBrain])
  const [selectedBrainIds, setSelectedBrainIds] = useState<string[]>(() =>
    activeBrain?.id ? [activeBrain.id] : [],
  );

  const toggleBrain = (id: string) => {
    setSelectedBrainIds((prev) => {
      if (prev.includes(id)) {
        // Don't allow deselecting the last brain
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  // First selected brain = save target
  const targetBrain = useMemo((): Brain | null => {
    if (!brains?.length) return activeBrain;
    return brains.find((b: Brain) => b.id === selectedBrainIds[0]) || activeBrain;
  }, [selectedBrainIds, brains, activeBrain]);

  // Merged & deduplicated question set from all selected brain types
  const questionSet = useMemo((): Suggestion[] => {
    const selectedBrains = brains?.length
      ? brains.filter((b: Brain) => selectedBrainIds.includes(b.id))
      : [activeBrain];
    const seen = new Set<string>();
    const merged: Suggestion[] = [];
    for (const b of selectedBrains) {
      for (const s of getSuggestionsForType(b?.type || "personal")) {
        if (!seen.has(s.q)) {
          seen.add(s.q);
          merged.push(s);
        }
      }
    }
    return merged;
  }, [selectedBrainIds, brains, activeBrain]);

  // brainType used only for AI context — use first selected brain's type
  const brainType = targetBrain?.type || "personal";

  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answered, setAnswered] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [showInput, setShowInput] = useState(false);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [filterCat, setFilterCat] = useState("all");
  const [, setAnim] = useState("");
  const [saving, setSaving] = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [aiQuestion, setAiQuestion] = useState<AiQuestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
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

  // Reset position when selected brains change
  useEffect(() => {
    setIdx(0);
    setFilterCat("all");
    setAiQuestion(null);
    setAnswered(0);
    setSkipped(0);
  }, [selectedBrainIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const [bulkFiles, setBulkFiles] = useState<File[] | null>(null);

  // Skipped onboarding questions — load once, stay at top of queue
  const [onboardingSkipped] = useState<Suggestion[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("openbrain_onboarding_skipped") || "[]");
    } catch {
      return [];
    }
  });

  const position = answered + skipped;

  const view = useMemo((): Suggestion[] => {
    // Skipped onboarding questions come first (if not yet answered and matching category filter)
    const skippedPriority = onboardingSkipped.filter(
      (s: Suggestion) => !answeredQs.has(s.q) && (filterCat === "all" || s.cat === filterCat),
    );
    const base =
      filterCat === "all"
        ? questionSet
        : questionSet.filter((s: Suggestion) => s.cat === filterCat);
    const rest = base.filter(
      (s: Suggestion) =>
        !answeredQs.has(s.q) && !skippedPriority.find((sp: Suggestion) => sp.q === s.q), // avoid duplicates if already in set
    );
    return [...skippedPriority, ...rest];
  }, [filterCat, answeredQs, questionSet, onboardingSkipped]);

  const total = view.length;
  const poolEmpty = total === 0;
  const isAiSlot = poolEmpty || position % 5 === 4;
  const current: AiQuestion | Suggestion | null = isAiSlot
    ? aiLoading
      ? null
      : aiQuestion
    : view[idx % total];

  useEffect(() => {
    if (!isAiSlot || aiQuestion || aiLoading) return;
    setAiLoading(true);
    const ctx = entries
      .slice(0, 30)
      .map((e: Entry) => `- ${e.title}: ${(e.content || "").slice(0, 100)}`)
      .join("\n");
    const brainContext =
      brainType === "family"
        ? "family shared knowledge base (household, family members, emergencies, finances)"
        : brainType === "business"
          ? "business knowledge base (suppliers, staff, SOPs, costs, licences, equipment)"
          : "personal knowledge base";
    callAI({
      max_tokens: 200,
      system: PROMPTS.FILL_BRAIN.replace("{{BRAIN_CONTEXT}}", brainContext),
      brainId: targetBrain?.id,
      messages: [
        {
          role: "user",
          content: `What they have captured so far:\n${ctx}\n\nWhat important gap should they fill next?`,
        },
      ],
    })
      .then((r) => r.json())
      .then((data) => {
        const raw = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
        let parsed: any = {};
        try {
          parsed = JSON.parse(raw);
        } catch {}
        setAiQuestion(
          parsed.q
            ? { q: parsed.q, cat: parsed.cat || "✨ AI", p: parsed.p || "medium", ai: true }
            : {
                q: "What's one important thing you haven't captured yet?",
                cat: "✨ AI",
                p: "medium",
                ai: true,
              },
        );
      })
      .catch(() =>
        setAiQuestion({
          q: "What's one important thing you haven't captured yet?",
          cat: "✨ AI",
          p: "medium",
          ai: true,
        }),
      )
      .finally(() => setAiLoading(false));
  }, [isAiSlot, aiQuestion, aiLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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
                  { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
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
            const { text } = await transcribeRes.json();
            if (text?.trim()) setAnswer((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()));
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
        if (isAiSlot) {
          setAiQuestion(null);
        } else if (total > 0) {
          setIdx((p) => (p + 1) % total);
        }
      }, 200);
    },
    [isAiSlot, total],
  );

  const handleSave = async () => {
    if (!answer.trim()) return;
    const a = answer.trim();
    setSaving(true);
    try {
      const res = await callAI({
        max_tokens: 800,
        system: PROMPTS.QA_PARSE,
        brainId: targetBrain?.id,
        messages: [{ role: "user", content: `Question: ${current!.q}\nAnswer: ${a}` }],
      });
      const data = await res.json();
      let parsed: any = {};
      try {
        parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
      } catch {}
      if (parsed.title) {
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
        const savedToDB = rpcRes.ok;
        const newEntry: Entry = {
          id: Date.now().toString(),
          ...parsed,
          pinned: false,
          importance: 0,
          tags: parsed.tags || [],
          created_at: new Date().toISOString(),
        };
        setEntries((prev: Entry[]) => [newEntry, ...prev]);
        setSaved((prev: SavedItem[]) => [
          { q: current!.q, a, cat: current!.cat, db: savedToDB, brain: targetBrain },
          ...prev,
        ]);
      }
    } catch {
      setSaved((prev: SavedItem[]) => [
        { q: current!.q, a, cat: current!.cat, db: false, brain: targetBrain },
        ...prev,
      ]);
    }

    if (!isAiSlot && current?.q) {
      setAnsweredQs((prev) => {
        const updated = new Set(prev);
        updated.add(current.q);
        try {
          localStorage.setItem(answeredKey, JSON.stringify([...updated]));
        } catch {}
        return updated;
      });
      // Remove from skipped onboarding list if it was there
      try {
        const skipped = JSON.parse(localStorage.getItem("openbrain_onboarding_skipped") || "[]");
        const updated = skipped.filter((s: any) => s.q !== current!.q);
        localStorage.setItem("openbrain_onboarding_skipped", JSON.stringify(updated));
      } catch {}
    }

    setSaving(false);
    setAnswered((n) => n + 1);
    next("save");
  };

  const copyAll = () => {
    const text = saved
      .map((s: SavedItem) => `**${s.cat}**\nQ: ${s.q}\nA: ${s.a}`)
      .join("\n\n---\n\n");
    navigator.clipboard
      .writeText(text)
      .catch((err) => console.error("[SuggestionsView:copyAll] Failed to copy text", err));
  };

  const pc = current ? PC[current.p as Priority] || PC.medium : PC.medium;
  const bm = BRAIN_META[brainType as keyof typeof BRAIN_META] || BRAIN_META.personal;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Brain selector chips — multi-select */}
      {brains?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
            Fill which brain{brains.length > 1 ? "s" : ""}?
          </p>
          {brains.length > 1 ? (
            <div className="flex flex-wrap gap-2 mb-2">
              {brains.map((b: Brain) => {
                const bmt =
                  BRAIN_META[(b.type || "personal") as keyof typeof BRAIN_META] ||
                  BRAIN_META.personal;
                const active = selectedBrainIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => toggleBrain(b.id)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 border text-xs font-medium transition-colors"
                    style={{
                      background: active ? "var(--color-primary-container)" : "var(--color-surface-container)",
                      borderColor: active ? "var(--color-primary)" : "var(--color-outline-variant)",
                      color: active ? "var(--color-primary)" : "var(--color-on-surface-variant)",
                    }}
                  >
                    <span>{bmt.emoji}</span>
                    <span>{b.name}</span>
                    {active && selectedBrainIds.length > 1 && selectedBrainIds[0] === b.id && (
                      <span className="text-[10px] ml-1" style={{ color: "var(--color-primary)" }}>✓ saves here</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-sm text-on-surface">
              {bm.emoji} {targetBrain?.name || bm.label}
            </span>
          )}
          <p className="text-xs text-on-surface-variant mt-1">
            {selectedBrainIds.length > 1 ? (
              <>
                Showing merged questions · saves go to{" "}
                <strong className="text-on-surface">
                  {bm.emoji} {targetBrain?.name || bm.label}
                </strong>
              </>
            ) : (
              <>
                Showing questions for{" "}
                <strong className="text-on-surface">
                  {bm.emoji} {targetBrain?.name || bm.label}
                </strong>
              </>
            )}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { l: "Answered", v: answered, color: "var(--color-primary)" },
          { l: "Skipped", v: skipped, color: "var(--color-on-surface-variant)" },
          { l: "Remaining", v: Math.max(0, total - (idx % Math.max(total, 1))), color: "var(--color-secondary)" },
        ].map((s) => (
          <div
            key={s.l}
            className="rounded-xl border px-3 py-2.5 text-center"
            style={{ background: "var(--color-surface-container)", borderColor: "var(--color-outline-variant)" }}
          >
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.v}</div>
            <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-outline-variant)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(total > 0 ? ((answered + skipped) / total) * 100 : 0, 100)}%`,
            background: "var(--color-primary)",
          }}
        />
      </div>

      {/* Category filter chips removed — not needed */}

      {/* Pool empty state */}
      {poolEmpty && (
        <div
          className="rounded-2xl border px-4 py-3 text-center"
          style={{ background: "var(--color-primary-container)", borderColor: "var(--color-primary)" }}
        >
          <span className="text-xs" style={{ color: "var(--color-primary)" }}>
            ✨ All {answeredQs.size} static questions answered — AI is now driving
          </span>
        </div>
      )}

      {/* AI loading state */}
      {isAiSlot && aiLoading && (
        <div
          className="rounded-2xl border px-4 py-6 text-center"
          style={{ background: "var(--color-secondary-container)", borderColor: "var(--color-secondary)" }}
        >
          <div className="text-2xl mb-2">✨</div>
          <p className="text-sm" style={{ color: "var(--color-secondary)" }}>AI is generating a personalised question…</p>
        </div>
      )}

      {/* Current question card */}
      {current && !aiLoading && (
        <div
          className="rounded-2xl border px-4 py-4"
          style={{ background: "var(--color-surface-container)", borderColor: "var(--color-outline-variant)" }}
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ color: pc.l === "High" ? "var(--color-error)" : pc.l === "Medium" ? "var(--color-status-medium)" : "var(--color-primary)", background: pc.l === "High" ? "color-mix(in oklch, var(--color-error) 12%, transparent)" : pc.l === "Medium" ? "var(--color-status-medium-container)" : "var(--color-primary-container)" }}
            >
              {pc.l}
            </span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ color: "var(--color-secondary)", background: "var(--color-secondary-container)" }}
            >
              {current.cat}
            </span>
            {isAiSlot && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: "var(--color-primary)", background: "var(--color-primary-container)" }}
              >
                ✨ AI
              </span>
            )}
            {!isAiSlot &&
              current &&
              onboardingSkipped.find((s: Suggestion) => s.q === current.q) && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: "var(--color-status-medium)", background: "var(--color-status-medium-container)" }}
                >
                  ↩ From onboarding
                </span>
              )}
            <span className="text-[10px] text-on-surface-variant ml-auto">#{idx + 1}/{total}</span>
          </div>
          <p className="text-base font-medium text-on-surface leading-relaxed">{current.q}</p>
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
            className="flex-1 py-3 rounded-xl border text-sm font-medium text-on-surface-variant transition-colors hover:bg-white/5 disabled:opacity-40"
            style={{ borderColor: "var(--color-outline-variant)", background: "transparent" }}
          >
            Skip →
          </button>
          <button
            onClick={() => setShowInput(true)}
            disabled={!current || aiLoading}
            className="flex-[2] py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
            style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          >
            Answer this
          </button>
        </div>
      ) : (
        <div className="space-y-3">
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
          {imgError && <p className="text-xs text-error">{imgError}</p>}
          {micError && <p className="text-xs text-error">{micError}</p>}
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={listening ? "Listening..." : "Type your answer..."}
            autoFocus
            rows={3}
            className="w-full rounded-xl border px-3 py-3 text-sm text-on-surface bg-transparent outline-none resize-none placeholder:text-on-surface-variant focus:border-[var(--color-primary)] transition-colors"
            style={{ borderColor: "var(--color-outline-variant)", fontFamily: "'DM Sans', system-ui, sans-serif" }}
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
              className="px-3 py-2 rounded-xl border text-xs text-on-surface-variant transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--color-outline-variant)", background: "transparent" }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setSkipped((s) => s + 1);
                next("skip");
              }}
              className="px-3 py-2 rounded-xl border text-xs text-on-surface-variant transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--color-outline-variant)", background: "transparent" }}
            >
              Skip
            </button>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={startVoice}
                disabled={imgLoading || saving}
                title="Voice input"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition-colors hover:bg-white/10 disabled:opacity-40"
                style={listening ? { background: "color-mix(in oklch, var(--color-error) 15%, transparent)" } : undefined}
              >
                {listening ? "⏹" : "🎤"}
              </button>
              <button
                onClick={() => imgRef.current?.click()}
                disabled={imgLoading || saving}
                title="Upload photo"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                📷
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={imgLoading || saving}
                title="Upload file (PDF, Word, MD, TXT)"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                📄
              </button>
              <button
                onClick={() => bulkFileRef.current?.click()}
                disabled={imgLoading || saving}
                title="Bulk upload multiple files"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                📁
              </button>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={!answer.trim() || saving || imgLoading}
            className="w-full py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
            style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
          >
            {saving
              ? "Saving..."
              : imgLoading
                ? "Processing..."
                : listening
                  ? "Listening..."
                  : `Save to ${bm.emoji} ${targetBrain?.name || bm.label}`}
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest">
              This session ({saved.length})
            </p>
            <button
              onClick={copyAll}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: "var(--color-primary)" }}
            >
              📋 Copy All
            </button>
          </div>
          <div className="space-y-2">
            {saved.map((s, i) => (
              <div
                key={i}
                className="rounded-xl border px-3 py-2.5"
                style={{ background: "var(--color-surface-container-low)", borderColor: "var(--color-outline-variant)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ color: "var(--color-secondary)", background: "var(--color-secondary-container)" }}
                  >
                    {s.cat}
                  </span>
                  {s.brain && (
                    <span className="text-[10px] text-on-surface-variant">
                      {BRAIN_META[(s.brain.type || "personal") as keyof typeof BRAIN_META]?.emoji}{" "}
                      {s.brain.name}
                    </span>
                  )}
                  {s.db && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full ml-auto"
                      style={{ color: "var(--color-primary)", background: "var(--color-primary-container)" }}
                    >
                      Saved
                    </span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
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
