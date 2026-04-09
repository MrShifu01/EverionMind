import { useState, useRef, useCallback } from "react";
import { authFetch } from "../lib/authFetch";
import { getUserApiKey, getGroqKey } from "../lib/aiSettings";

interface UseQuickCaptureVoiceOptions {
  onTranscript: (text: string) => void;
  onStatus: (status: string | null) => void;
  onLoading: (loading: boolean) => void;
}

export function useQuickCaptureVoice({
  onTranscript,
  onStatus,
  onLoading,
}: UseQuickCaptureVoiceOptions) {
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const _startSpeechRecognitionFallback = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR: (new () => any) | undefined = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      onTranscript("[Voice not supported in this browser]");
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
      onTranscript(transcript);
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
  }, [listening, onTranscript]);

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

        onLoading(true);
        onStatus("thinking");
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
            if (text?.trim()) onTranscript(text.trim());
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
                  console.error("[useQuickCaptureVoice] recordUsage (transcription) failed", err),
                );
            }
          } else {
            console.warn("[Whisper] transcription failed:", transcribeRes.status);
            onTranscript("[Transcription failed — try again]");
          }
        } catch (err) {
          console.error("[Whisper] error:", err);
          onTranscript("[Voice error — check console]");
        }
        onLoading(false);
        onStatus(null);
      };

      recorder.start(1000); // timeslice 1s — ensures ondataavailable fires on iOS
      setListening(true);
    } catch (err: unknown) {
      const micErr = err as { message?: string; name?: string };
      console.warn("[Voice] mic error:", micErr.message);
      // Show error to user instead of silently failing
      if (micErr.name === "NotAllowedError" || micErr.name === "PermissionDeniedError") {
        onStatus("mic-denied");
        setTimeout(() => onStatus(null), 3000);
      } else {
        // Try browser speech recognition as last resort
        _startSpeechRecognitionFallback();
      }
    }
  }, [listening, _startSpeechRecognitionFallback, stopWhisperRecording, onTranscript, onStatus, onLoading]);

  return { listening, startVoice, stopWhisperRecording };
}
