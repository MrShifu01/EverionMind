import { useCallback, useRef, useState } from "react";
import { authFetch } from "../lib/authFetch";
import { getGroqKey } from "../lib/aiSettings";

const MIN_VOICE_BLOB_BYTES = 1000;
const VOICE_RECORDER_CHUNK_MS = 1000;

interface UseVoiceRecorderOptions {
  onTranscript: (text: string) => void;
  onStatus: (status: string | null) => void;
  onError: (message: string | null) => void;
  onLoading: (loading: boolean) => void;
}

export function useVoiceRecorder({
  onTranscript,
  onStatus,
  onError,
  onLoading,
}: UseVoiceRecorderOptions) {
  const [listening, setListening] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const startVoice = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      stopRecording();
      return;
    }

    const groqKey = getGroqKey();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = "audio/mp4";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
        mimeType = "audio/webm;codecs=opus";
      else if (MediaRecorder.isTypeSupported("audio/webm")) mimeType = "audio/webm";
      else if (MediaRecorder.isTypeSupported("audio/mp4")) mimeType = "audio/mp4";

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
        if (blob.size < MIN_VOICE_BLOB_BYTES) return;

        onLoading(true);
        onStatus("transcribing");
        onError(null);
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (groqKey) headers["X-Groq-Api-Key"] = groqKey;
          const transcribeRes = await authFetch("/api/transcribe", {
            method: "POST",
            headers,
            body: JSON.stringify({ audio: base64, mimeType: actualMime, language: "en" }),
          });
          if (transcribeRes.ok) {
            const {
              text: t,
              audioBytes,
              provider: txProvider,
              model: txModel,
            } = await transcribeRes.json();
            if (t?.trim()) onTranscript(t.trim());
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
                  console.error("[useVoiceRecorder] recordUsage (transcription) failed", err),
                );
            }
          } else {
            const errBody = await transcribeRes.text().catch(() => "");
            onError(`[transcribe] HTTP ${transcribeRes.status} — ${errBody}`);
          }
        } catch (e: any) {
          onError(`[transcribe] ${e?.message || String(e)}`);
        }
        onLoading(false);
        onStatus(null);
      };

      recorder.start(VOICE_RECORDER_CHUNK_MS);
      setListening(true);
    } catch (e: any) {
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        onError("[voice] Microphone permission denied");
      } else {
        onError(`[voice] ${e?.message || String(e)}`);
      }
    }
  }, [stopRecording, onTranscript, onStatus, onError, onLoading]);

  const resetListening = useCallback(() => setListening(false), []);

  return { listening, startVoice, stopRecording, resetListening };
}
