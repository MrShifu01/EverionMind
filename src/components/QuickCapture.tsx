// @ts-nocheck
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { useTheme } from "../ThemeContext";
import { callAI } from "../lib/ai";
import { aiFetch, getUserModel, getUserApiKey, getGroqKey, getEmbedHeaders } from "../lib/aiFetch";
import { encryptEntry } from "../lib/crypto";
import { authFetch } from "../lib/authFetch";
import { enqueue } from "../lib/offlineQueue";
import { findConnections, scoreTitle } from "../lib/connectionFinder";
import { recordDecision } from "../lib/learningEngine";
import { TC } from "../data/constants";
import { PROMPTS } from "../config/prompts";
import { isSupportedFile, isTextFile, readTextFile, readFileAsBase64 } from "../lib/fileParser";
import { shouldSplitContent, buildSplitPrompt, parseAISplitResponse } from "../lib/fileSplitter";

const BRAIN_META_QC = {
  personal: { emoji: "🧠" },
  family: { emoji: "🏠" },
  business: { emoji: "🏪" },
};

function PreviewModal({ preview, entries, onSave, onUpdate, onCancel }) {
  const [title, setTitle] = useState(preview.title || "");
  const [type, setType] = useState(preview.type || "note");
  const [tags, setTags] = useState((preview.tags || []).join(", "));
  const dupes = useMemo(() => {
    if (!title.trim()) return [];
    return entries.filter((e) => scoreTitle(title, e.title) > 50).slice(0, 3);
  }, [title, entries]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-5"
        style={{ background: "#1a1919", borderColor: "rgba(72,72,71,0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">Preview before saving</span>
          <button onClick={onCancel} className="text-[#777] hover:text-white text-lg">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 text-sm text-white bg-transparent outline-none focus:border-[rgba(114,239,245,0.5)] transition-colors"
              style={{ borderColor: "rgba(72,72,71,0.3)", fontFamily: "'Inter', sans-serif" }}
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-1.5">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 text-sm text-white outline-none appearance-none cursor-pointer focus:border-[rgba(114,239,245,0.5)] transition-colors"
              style={{ borderColor: "rgba(72,72,71,0.3)", background: "rgba(38,38,38,0.6)" }}
            >
              {Object.keys(TC).map((t) => (
                <option key={t} value={t}>
                  {TC[t].i} {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-[#aaa] mb-1.5">
              Tags <span className="normal-case tracking-normal text-[#555]">(comma separated)</span>
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tag1, tag2"
              className="w-full rounded-xl border px-3 py-2.5 text-sm text-white bg-transparent outline-none placeholder:text-[#555] focus:border-[rgba(114,239,245,0.5)] transition-colors"
              style={{ borderColor: "rgba(72,72,71,0.3)", fontFamily: "'Inter', sans-serif" }}
            />
          </div>
        </div>
        {dupes.length > 0 && (
          <div className="mt-4 p-3 rounded-xl border" style={{ borderColor: "rgba(255,180,0,0.2)", background: "rgba(255,180,0,0.05)" }}>
            <p className="text-xs text-[#ffb400] font-semibold mb-2">⚠ Similar entries found — update one instead?</p>
            {dupes.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-xs text-[#aaa] truncate">• {d.title}</span>
                <button
                  onClick={() => {
                    onUpdate(d.id, {
                      title: title.trim(),
                      type,
                      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
                      content: preview.content,
                      metadata: preview.metadata,
                    });
                    onCancel();
                  }}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-lg flex-shrink-0"
                  style={{ color: "#72eff5", background: "rgba(114,239,245,0.1)" }}
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
            className="flex-1 py-2.5 rounded-xl border text-sm text-[#aaa] transition-colors hover:bg-white/5"
            style={{ borderColor: "rgba(72,72,71,0.3)", background: "transparent" }}
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                ...preview,
                title: title.trim(),
                type,
                tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
              })
            }
            disabled={!title.trim()}
            className="flex-[2] py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #72eff5, #1fb1b7)", color: "#0a0a0a" }}
          >
            Save to OpenBrain
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
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [preview, setPreview] = useState(null);
  const [listening, setListening] = useState(false);
  // Multi-brain: which brains to capture into (primary = first element)
  const [selectedBrainIds, setSelectedBrainIds] = useState(() => (brainId ? [brainId] : []));
  const [multiPreview, setMultiPreview] = useState(null); // array of parsed entries from file split
  const imgRef = useRef(null);
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);
  const connectionsTimerRef = useRef(null);
  const lastConnectionsLengthRef = useRef(entries ? entries.length : 0);

  // Keep selection in sync when active brain changes
  useEffect(() => {
    if (brainId) setSelectedBrainIds((prev) => (prev.includes(brainId) ? prev : [brainId]));
  }, [brainId]);

  function toggleBrain(id) {
    setSelectedBrainIds((prev) => {
      if (prev.includes(id)) return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      return [...prev, id];
    });
  }

  const primaryBrainId = selectedBrainIds[0] || brainId;
  const extraBrainIds = selectedBrainIds.slice(1);

  const handleImageUpload = async (e) => {
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
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
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

  const handleFileUpload = async (e) => {
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
        // Text files: read directly
        extractedText = await readTextFile(file);
      } else {
        // PDF/DOCX: send to AI for text extraction
        const { base64, mimeType } = await readFileAsBase64(file);
        const isPdf = file.name.toLowerCase().endsWith(".pdf");
        const contentBlock = isPdf
          ? {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            }
          : { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } };

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
                  contentBlock,
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
          setMultiPreview(entries);
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

  const saveMultiEntries = async (entriesToSave) => {
    setMultiPreview(null);
    setLoading(true);
    setStatus("saving");
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
          const newEntry = {
            id: result?.id || Date.now().toString() + savedCount,
            ...parsed,
            pinned: false,
            importance: 0,
            tags: parsed.tags || [],
            created_at: new Date().toISOString(),
          };
          setEntries((prev) => [newEntry, ...prev]);
          onCreated?.(newEntry);
          savedCount++;
        }
      } catch (err) {
        console.error("[multiSave] error:", err);
      }
    }
    setStatus(savedCount > 0 ? "saved-db" : "error");
    setLoading(false);
    setTimeout(() => setStatus(null), 3000);
  };

  // Whisper recording state
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const _startSpeechRecognitionFallback = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
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
    let silenceTimer = null;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");
      setText(transcript);
      clearTimeout(silenceTimer);
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
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          const transcribeHeaders = { "Content-Type": "application/json" };
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
    } catch (err) {
      console.warn("[Voice] mic error:", err.message);
      // Show error to user instead of silently failing
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
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
    async (parsed) => {
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
      setStatus("saving");
      try {
        if (parsed.title) {
          if (!isOnline) {
            const tempId = Date.now().toString();
            const newEntry = {
              id: tempId,
              title: parsed.title,
              content: parsed.content || "",
              type: parsed.type || "note",
              metadata: parsed.metadata || {},
              pinned: false,
              importance: 0,
              tags: parsed.tags || [],
              created_at: new Date().toISOString(),
            };
            await enqueue({
              id: crypto.randomUUID(),
              url: "/api/capture",
              method: "POST",
              body: JSON.stringify({
                p_title: parsed.title,
                p_content: parsed.content || "",
                p_type: parsed.type || "note",
                p_metadata: parsed.metadata || {},
                p_tags: parsed.tags || [],
              }),
              created_at: new Date().toISOString(),
              tempId,
            });
            refreshCount?.();
            setEntries((prev) => [newEntry, ...prev]);
            onCreated?.(newEntry);
            setStatus("saved-local");
          } else {
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
              serverContent = encrypted.content;
              serverMetadata = encrypted.metadata;
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
              const newEntry = {
                id: result?.id || Date.now().toString(),
                title: parsed.title,
                content: parsed.content || "",
                type: parsed.type || "note",
                metadata: parsed.metadata || {},
                pinned: false,
                importance: 0,
                tags: parsed.tags || [],
                created_at: new Date().toISOString(),
              };
              setEntries((prev) => [newEntry, ...prev]);
              onCreated?.(newEntry);
              setStatus("saved-db");
              // Embedding now handled server-side in /api/capture
              // PERF-6: debounce findConnections by 5 s; skip during bulk import
              // (heuristic: if entries grew by more than 3 since last run, it's a bulk import)
              const currentLength = entries.length;
              const delta = currentLength - lastConnectionsLengthRef.current;
              lastConnectionsLengthRef.current = currentLength + 1; // +1 for the entry being saved
              if (delta <= 3) {
                clearTimeout(connectionsTimerRef.current);
                const entrySnapshot = newEntry;
                const entriesSnapshot = entries;
                const linksSnapshot = links || [];
                connectionsTimerRef.current = setTimeout(() => {
                  findConnections(
                    entrySnapshot,
                    entriesSnapshot,
                    linksSnapshot,
                    primaryBrainId,
                  ).then((newLinks) => {
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
              console.warn("[doSave] API returned non-ok, queuing for retry:", rpcRes.status);
              const tempId = Date.now().toString();
              const newEntry = {
                id: tempId,
                ...parsed,
                pinned: false,
                importance: 0,
                tags: parsed.tags || [],
                created_at: new Date().toISOString(),
              };
              await enqueue({
                id: crypto.randomUUID(),
                url: "/api/capture",
                method: "POST",
                body: JSON.stringify({
                  p_title: parsed.title,
                  p_content: parsed.content || "",
                  p_type: parsed.type || "note",
                  p_metadata: parsed.metadata || {},
                  p_tags: parsed.tags || [],
                }),
                created_at: new Date().toISOString(),
                tempId,
              });
              refreshCount?.();
              setEntries((prev) => [newEntry, ...prev]);
              onCreated?.(newEntry);
              setStatus("error");
            }
          }
        }
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
      setLoading(false);
      setTimeout(() => setStatus(null), 3000);
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
    setStatus("thinking");
    if (!isOnline) {
      const tempId = Date.now().toString();
      const newEntry = {
        id: tempId,
        title: input.slice(0, 60),
        content: input,
        type: "note",
        metadata: {},
        pinned: false,
        importance: 0,
        tags: [],
        created_at: new Date().toISOString(),
      };
      await enqueue({
        id: crypto.randomUUID(),
        type: "raw-capture",
        anthropicRequest: {
          model: getUserModel(),
          max_tokens: 800,
          system: PROMPTS.CAPTURE,
          messages: [{ role: "user", content: input }],
        },
        tempId,
        created_at: new Date().toISOString(),
      });
      refreshCount?.();
      setEntries((prev) => [newEntry, ...prev]);
      onCreated?.(newEntry);
      setStatus("saved-local");
      setLoading(false);
      setTimeout(() => setStatus(null), 3000);
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
      let parsed = {};
      try {
        parsed = JSON.parse((data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim());
      } catch {}
      if (parsed.title) {
        setLoading(false);
        setStatus(null);
        setPreview({ ...parsed, _raw: input });
        return;
      }
      const newEntry = {
        id: Date.now().toString(),
        title: input.slice(0, 60),
        content: input,
        type: "note",
        metadata: {},
        pinned: false,
        importance: 0,
        tags: [],
        created_at: new Date().toISOString(),
      };
      setEntries((prev) => [newEntry, ...prev]);
      onCreated?.(newEntry);
      setStatus("saved-raw");
    } catch (e) {
      console.error("[capture] API error, queuing for retry:", e);
      const tempId = Date.now().toString();
      const newEntry = {
        id: tempId,
        title: input.slice(0, 60),
        content: input,
        type: "note",
        metadata: {},
        pinned: false,
        importance: 0,
        tags: [],
        created_at: new Date().toISOString(),
      };
      await enqueue({
        id: crypto.randomUUID(),
        type: "raw-capture",
        anthropicRequest: {
          model: getUserModel(),
          max_tokens: 800,
          system: PROMPTS.CAPTURE,
          messages: [{ role: "user", content: input }],
        },
        tempId,
        created_at: new Date().toISOString(),
      });
      refreshCount?.();
      setEntries((prev) => [newEntry, ...prev]);
      onCreated?.(newEntry);
      setStatus("error");
    }
    setLoading(false);
    setTimeout(() => setStatus(null), 3000);
  };

  const statusMsg = {
    thinking: "🤖 Parsing...",
    saving: "💾 Saving...",
    "saved-db": "✅ Saved & synced!",
    "saved-local": "📡 Saved — will sync when online",
    "saved-raw": "📝 Saved",
    error: "⚠️ Sync failed — queued for retry",
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
          style={{ background: "rgba(38,38,38,0.4)", borderColor: "rgba(72,72,71,0.15)" }}
        >
          <span>🔒</span>
          <span className="text-sm text-[#777]">You have view-only access to this brain</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-3 pb-2">
      {/* Capture input bar */}
      <div
        className="flex items-center gap-2 rounded-2xl px-3 py-2 border transition-colors focus-within:border-[rgba(114,239,245,0.5)]"
        style={{
          background: "rgba(38,38,38,0.6)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderColor: "rgba(72,72,71,0.2)",
        }}
      >
        {/* Hidden file inputs */}
        <input type="file" accept="image/*" ref={imgRef} onChange={handleImageUpload} className="hidden" />
        <input
          type="file"
          accept=".txt,.md,.csv,.pdf,.docx,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ref={fileRef}
          onChange={handleFileUpload}
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
          className="flex-1 min-w-0 bg-transparent text-white text-sm outline-none placeholder:text-[#555]"
          style={{ fontFamily: "'Inter', sans-serif" }}
        />

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={startVoice}
            disabled={loading}
            title="Voice capture"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition-colors hover:bg-white/10 disabled:opacity-40"
            style={listening ? { background: "rgba(255,110,132,0.2)" } : undefined}
          >
            🎤
          </button>
          <button
            onClick={() => imgRef.current?.click()}
            disabled={loading}
            title="Photo capture"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            📷
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            title="Upload file (PDF, Word, MD, TXT)"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            📄
          </button>
          <button
            onClick={capture}
            disabled={loading || !text.trim()}
            title={`Save to ${(BRAIN_META_QC[brains[0]?.type] || BRAIN_META_QC.personal).emoji} ${brains[0]?.name || "brain"}`}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-lg font-bold transition-all disabled:opacity-30"
            style={{
              background: text.trim() ? "linear-gradient(135deg, #72eff5, #1fb1b7)" : "rgba(72,72,71,0.3)",
              color: text.trim() ? "#0a0a0a" : "#555",
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Status message */}
      {status && (
        <div className="mt-2 px-1">
          <p className="text-xs" style={{ color: status === "error" || status.includes("large") || status.includes("unsupported") ? "#ff6e84" : "#72eff5" }}>
            {statusMsg[status]}
          </p>
          {status === "vault-needed" && onNavigate && (
            <button
              onClick={() => {
                onNavigate("vault");
                setStatus(null);
              }}
              className="text-xs font-semibold mt-1 px-3 py-1 rounded-lg transition-colors"
              style={{ color: "#72eff5", background: "rgba(114,239,245,0.1)" }}
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
          onUpdate={onUpdate}
          onCancel={() => setPreview(null)}
        />
      )}

      {/* Multi-entry preview modal */}
      {multiPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setMultiPreview(null)}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border p-5"
            style={{ background: "#1a1919", borderColor: "rgba(72,72,71,0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">✂️ {multiPreview.length} entries found in file</span>
              <button onClick={() => setMultiPreview(null)} className="text-[#777] hover:text-white text-lg">✕</button>
            </div>
            <p className="text-xs text-[#777] mb-4">
              Review the entries extracted from your file. Remove any you don't want, then save all.
            </p>
            <div className="space-y-3">
              {multiPreview.map((entry, i) => (
                <div
                  key={i}
                  className="relative rounded-xl border p-3"
                  style={{ background: "rgba(38,38,38,0.6)", borderColor: "rgba(72,72,71,0.2)" }}
                >
                  <button
                    onClick={() => setMultiPreview((prev) => prev.filter((_, j) => j !== i))}
                    title="Remove"
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-xs text-[#777] hover:text-white hover:bg-white/10"
                  >
                    ✕
                  </button>
                  <div className="flex items-center gap-2 mb-1">
                    <span>{TC[entry.type]?.i || "📝"}</span>
                    <span className="text-sm font-semibold text-white truncate">{entry.title}</span>
                    <span className="text-[10px] uppercase tracking-wider text-[#777] ml-auto mr-6">{entry.type}</span>
                  </div>
                  <p className="text-xs text-[#777] leading-relaxed">
                    {(entry.content || "").slice(0, 150)}
                    {(entry.content || "").length > 150 ? "…" : ""}
                  </p>
                  {entry.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {entry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ color: "#72eff5", background: "rgba(114,239,245,0.1)" }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setMultiPreview(null)}
                className="flex-1 py-2.5 rounded-xl border text-sm text-[#aaa] transition-colors hover:bg-white/5"
                style={{ borderColor: "rgba(72,72,71,0.3)", background: "transparent" }}
              >
                Cancel
              </button>
              <button
                onClick={() => saveMultiEntries(multiPreview)}
                disabled={multiPreview.length === 0}
                className="flex-[2] py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #72eff5, #1fb1b7)", color: "#0a0a0a" }}
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

QuickCapture.propTypes = {
  entries: PropTypes.array.isRequired,
  setEntries: PropTypes.func.isRequired,
  links: PropTypes.array,
  addLinks: PropTypes.func,
  onCreated: PropTypes.func,
  onUpdate: PropTypes.func,
  isOnline: PropTypes.bool,
  refreshCount: PropTypes.func,
  brainId: PropTypes.string,
  brains: PropTypes.array,
  canWrite: PropTypes.bool,
};
