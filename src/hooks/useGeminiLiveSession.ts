import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "../lib/authFetch";
import type { GeminiVoice } from "./useVoiceMode";

export type LiveStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

interface StartOpts {
  voice: GeminiVoice;
  systemInstruction?: string;
}

interface SessionConfig {
  token: string;
  model: string;
  voice: string;
  wsUrl: string;
  inputSampleRate: number;
  outputSampleRate: number;
}

interface UseGeminiLiveSession {
  status: LiveStatus;
  error: string | null;
  userTranscript: string;
  assistantTranscript: string;
  start: (opts: StartOpts) => Promise<void>;
  stop: () => void;
}

// Decode base64 → Float32 for playback. Gemini Live returns 24 kHz mono
// int16-LE PCM, base64-encoded inside serverContent parts.
function base64ToFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.length / 2);
  for (let i = 0; i < out.length; i++) {
    const s = view.getInt16(i * 2, true);
    out[i] = s < 0 ? s / 0x8000 : s / 0x7fff;
  }
  return out;
}

function int16ToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + chunk, bytes.length))),
    );
  }
  return btoa(s);
}

export function useGeminiLiveSession(): UseGeminiLiveSession {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [userTranscript, setUserTranscript] = useState("");
  const [assistantTranscript, setAssistantTranscript] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const micNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef(0);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    try {
      wsRef.current?.close();
    } catch {
      /* ignore */
    }
    wsRef.current = null;
    try {
      micNodeRef.current?.port.close();
      micNodeRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    micNodeRef.current = null;
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    sourceRef.current = null;
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
    }
    streamRef.current = null;
    try {
      void micCtxRef.current?.close();
    } catch {
      /* ignore */
    }
    micCtxRef.current = null;
    try {
      void playCtxRef.current?.close();
    } catch {
      /* ignore */
    }
    playCtxRef.current = null;
    nextPlayTimeRef.current = 0;
    setStatus("idle");
  }, []);

  // Always release mic + WS when the component unmounts.
  useEffect(() => () => stop(), [stop]);

  const start = useCallback(
    async ({ voice, systemInstruction }: StartOpts) => {
      stoppedRef.current = false;
      setError(null);
      setUserTranscript("");
      setAssistantTranscript("");
      setStatus("connecting");

      let cfg: SessionConfig;
      try {
        const r = await authFetch("/api/llm?action=live-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice, systemInstruction }),
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || `HTTP ${r.status}`);
        }
        cfg = (await r.json()) as SessionConfig;
      } catch (e) {
        setError(e instanceof Error ? e.message : "session_failed");
        setStatus("error");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "mic_denied");
        setStatus("error");
        return;
      }
      if (stoppedRef.current) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      streamRef.current = stream;

      // Separate contexts: mic capture runs at system rate; playback uses
      // the model output rate (24 kHz). Keeping them distinct sidesteps
      // iOS Safari's "rate-locked" AudioContext quirk.
      const MicCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const micCtx = new MicCtx();
      micCtxRef.current = micCtx;
      try {
        await micCtx.audioWorklet.addModule("/audio-worklets/pcm-recorder.js");
      } catch (e) {
        stop();
        setError(e instanceof Error ? e.message : "worklet_failed");
        setStatus("error");
        return;
      }

      const playCtx = new MicCtx({ sampleRate: cfg.outputSampleRate });
      playCtxRef.current = playCtx;
      try {
        await playCtx.resume();
      } catch {
        /* iOS resumes lazily — first scheduled node will start it */
      }

      const url = `${cfg.wsUrl}?access_token=${encodeURIComponent(cfg.token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: cfg.model,
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice } },
                },
              },
              ...(systemInstruction
                ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
                : {}),
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          }),
        );
      };

      ws.onerror = () => {
        if (stoppedRef.current) return;
        setError("ws_error");
        setStatus("error");
      };

      ws.onclose = () => {
        if (stoppedRef.current) return;
        // Server closed: drop back to idle without flagging an error so the
        // UI doesn't look broken on a normal end-of-turn close.
        setStatus("idle");
      };

      ws.onmessage = async (ev) => {
        let msg: Record<string, unknown>;
        try {
          if (typeof ev.data === "string") msg = JSON.parse(ev.data);
          else if (ev.data instanceof Blob) msg = JSON.parse(await ev.data.text());
          else return;
        } catch {
          return;
        }

        if (msg.setupComplete) {
          // Setup acknowledged — wire mic worklet and start streaming.
          const source = micCtx.createMediaStreamSource(stream);
          sourceRef.current = source;
          const node = new AudioWorkletNode(micCtx, "pcm-recorder");
          micNodeRef.current = node;
          node.port.onmessage = (e) => {
            if (!(e.data instanceof ArrayBuffer)) return;
            const b64 = int16ToBase64(e.data);
            const open = wsRef.current?.readyState === WebSocket.OPEN;
            if (!open) return;
            wsRef.current?.send(
              JSON.stringify({
                realtimeInput: {
                  mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: b64 }],
                },
              }),
            );
          };
          source.connect(node);
          // Don't connect to destination — we don't want mic monitoring.
          setStatus("listening");
          return;
        }

        const sc = msg.serverContent as
          | {
              modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
              inputTranscription?: { text?: string };
              outputTranscription?: { text?: string };
              turnComplete?: boolean;
            }
          | undefined;
        if (!sc) return;

        if (sc.inputTranscription?.text) {
          const t = sc.inputTranscription.text;
          setUserTranscript((prev) => prev + t);
        }
        if (sc.outputTranscription?.text) {
          const t = sc.outputTranscription.text;
          setAssistantTranscript((prev) => prev + t);
          setStatus("speaking");
        }

        const parts = sc.modelTurn?.parts ?? [];
        for (const p of parts) {
          const data = p.inlineData?.data;
          if (!data) continue;
          // Schedule playback. Each chunk plays back-to-back to avoid gaps.
          const f32 = base64ToFloat32(data);
          const buf = playCtx.createBuffer(1, f32.length, cfg.outputSampleRate);
          buf.getChannelData(0).set(f32);
          const src = playCtx.createBufferSource();
          src.buffer = buf;
          src.connect(playCtx.destination);
          const startAt = Math.max(nextPlayTimeRef.current, playCtx.currentTime);
          src.start(startAt);
          nextPlayTimeRef.current = startAt + buf.duration;
        }

        if (sc.turnComplete) {
          // Output finished; back to listening if WS still open.
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            setStatus("listening");
          }
        }
      };
    },
    [stop],
  );

  return { status, error, userTranscript, assistantTranscript, start, stop };
}
