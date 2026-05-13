import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "../lib/authFetch";
import type { GeminiVoice } from "./useVoiceMode";

export type LiveStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

interface StartOpts {
  voice: GeminiVoice;
  brainId: string;
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
  /** Diagnostic counters — visible in the on-screen LiveBanner so users
   *  can report what stage actually failed when nothing happens. */
  lastEvent: string;
  chunksOut: number;
  chunksIn: number;
  closeCode: number | null;
  closeReason: string;
  start: (opts: StartOpts) => Promise<void>;
  stop: () => void;
  /** Pre-mint the Live session token + warm the audio worklet HTTP
   *  cache so a subsequent start() skips the network round-trip. Safe
   *  to call repeatedly; cache key is voice+brain+systemInstruction
   *  and lives for ~45s (Google ephemeral tokens are ~60s). */
  prewarm: (opts: StartOpts) => Promise<void>;
}

// Cached pre-minted token (module scope so it survives re-renders).
interface CachedConfig {
  cfg: SessionConfig;
  key: string;
  mintedAt: number;
}
let cachedConfig: CachedConfig | null = null;
const TOKEN_TTL_MS = 45_000;

function cacheKey(opts: StartOpts) {
  return `${opts.voice}|${opts.brainId}|${opts.systemInstruction ?? ""}`;
}

function takeFreshCached(opts: StartOpts): SessionConfig | null {
  if (!cachedConfig) return null;
  if (cachedConfig.key !== cacheKey(opts)) return null;
  if (Date.now() - cachedConfig.mintedAt > TOKEN_TTL_MS) {
    cachedConfig = null;
    return null;
  }
  // Single-use — clear so the same token isn't reused for a second
  // session (Google ephemeral tokens are scoped to one connection).
  const cfg = cachedConfig.cfg;
  cachedConfig = null;
  return cfg;
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
  const [lastEvent, setLastEvent] = useState("");
  const [chunksOut, setChunksOut] = useState(0);
  const [chunksIn, setChunksIn] = useState(0);
  const [closeCode, setCloseCode] = useState<number | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const chunksOutRef = useRef(0);
  const chunksInRef = useRef(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef(0);
  const stoppedRef = useRef(false);
  const brainIdRef = useRef<string>("");
  const debugSeenRef = useRef(0);

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
      void audioCtxRef.current?.close();
    } catch {
      /* ignore */
    }
    audioCtxRef.current = null;
    nextPlayTimeRef.current = 0;
    setStatus("idle");
  }, []);

  // Always release mic + WS when the component unmounts.
  useEffect(() => () => stop(), [stop]);

  const start = useCallback(
    async ({ voice, brainId, systemInstruction }: StartOpts) => {
      stoppedRef.current = false;
      setError(null);
      setUserTranscript("");
      setAssistantTranscript("");
      setStatus("connecting");
      setLastEvent("requesting mic + minting token…");
      setChunksOut(0);
      setChunksIn(0);
      setCloseCode(null);
      setCloseReason("");
      chunksOutRef.current = 0;
      chunksInRef.current = 0;
      debugSeenRef.current = 0;

      // Stash brainId for tool-call relay (Gemini fires toolCall events
      // with no brain context — we have to thread it in from the start).
      brainIdRef.current = brainId;

      // Mic + token in parallel. getUserMedia is fired SYNCHRONOUSLY in
      // the same tick as start() (no awaits before it) so iOS Safari
      // keeps the user-gesture context alive and pops the permission
      // prompt instantly — same behaviour as Add mode. Token mint runs
      // in the background while the user is reading the prompt.
      const streamPromise = navigator.mediaDevices.getUserMedia({ audio: true });
      const preMinted = takeFreshCached({ voice, brainId, systemInstruction });
      const cfgPromise: Promise<SessionConfig> = preMinted
        ? Promise.resolve(preMinted)
        : (async () => {
            const r = await authFetch("/api/llm?action=live-session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ voice, brain_id: brainId, systemInstruction }),
            });
            if (!r.ok) {
              const data = await r.json().catch(() => ({}));
              const msg =
                (data as { message?: string; error?: string }).message ||
                (data as { error?: string }).error ||
                `HTTP ${r.status}`;
              throw new Error(`mint:${r.status} ${msg}`);
            }
            return (await r.json()) as SessionConfig;
          })();

      let stream: MediaStream;
      try {
        stream = await streamPromise;
      } catch (e) {
        setError(e instanceof Error ? e.message : "mic_denied");
        setStatus("error");
        return;
      }
      setLastEvent("mic granted, awaiting token…");

      let cfg: SessionConfig;
      try {
        cfg = await cfgPromise;
        setLastEvent(
          `token ok${preMinted ? " (prewarmed)" : ""}, model=${cfg.model.replace("models/", "")}`,
        );
      } catch (e) {
        for (const t of stream.getTracks()) t.stop();
        setError(e instanceof Error ? e.message : "session_failed");
        setStatus("error");
        return;
      }
      if (stoppedRef.current) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      streamRef.current = stream;

      // Single AudioContext for both capture + playback. iOS Safari throws
      // (or hangs) when you pass an unsupported `sampleRate` to the
      // constructor — earlier "separate context at 24 kHz for playback"
      // bricked the flow right after worklet load. AudioBufferSourceNode
      // resamples 24 kHz inbound chunks to the system rate automatically.
      const AudioCtxCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      let audioCtx: AudioContext;
      try {
        audioCtx = new AudioCtxCtor();
      } catch (e) {
        setError(e instanceof Error ? `audio_ctx:${e.message}` : "audio_ctx_failed");
        setStatus("error");
        return;
      }
      audioCtxRef.current = audioCtx;
      setLastEvent(`loading worklet (rate=${audioCtx.sampleRate})…`);
      try {
        await audioCtx.audioWorklet.addModule("/audio-worklets/pcm-recorder.js");
      } catch (e) {
        stop();
        setError(e instanceof Error ? e.message : "worklet_failed");
        setStatus("error");
        return;
      }
      setLastEvent("worklet loaded");

      // iOS suspends contexts until a user gesture. The hold IS the gesture
      // but `resume()` still needs to be awaited or playback stays silent.
      try {
        await audioCtx.resume();
        setLastEvent(`ctx resumed (state=${audioCtx.state})`);
      } catch (e) {
        setLastEvent(e instanceof Error ? `ctx resume failed: ${e.message}` : "ctx resume failed");
      }

      // Token format is `auth_tokens/AUTHTOKEN_…` — the `/` must stay
      // literal in the query string per the official SDK behaviour
      // (see @google/genai BidiGenerateContentConstrained URL build).
      // URL-encoding it gets the handshake silently rejected by Google
      // and the iOS Safari WebSocket never fires onopen or onclose.
      const url = `${cfg.wsUrl}?access_token=${cfg.token}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        setError(e instanceof Error ? `ws_ctor:${e.message}` : "ws_ctor_failed");
        setStatus("error");
        return;
      }
      wsRef.current = ws;
      setLastEvent(`ws opening… rs=${ws.readyState}`);
      // Connection watchdog — if the socket is still CONNECTING after 8s,
      // surface that on screen so the user can report it. Without this iOS
      // Safari can hang silently on a rejected handshake.
      const wsWatchdog = window.setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING && !stoppedRef.current) {
          setLastEvent(`ws stuck CONNECTING after 8s (rs=${ws.readyState})`);
        }
      }, 8000);
      const clearWsWatchdog = () => window.clearTimeout(wsWatchdog);

      ws.onopen = () => {
        clearWsWatchdog();
        setLastEvent("ws open, sending setup");
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

      ws.onerror = (ev) => {
        if (stoppedRef.current) return;
        const type = (ev as Event).type || "ws_error";
        setError(`ws_error:${type}`);
        setLastEvent(`ws error (${type})`);
        setStatus("error");
      };

      ws.onclose = (ev) => {
        clearWsWatchdog();
        setCloseCode(ev.code);
        setCloseReason(ev.reason || "");
        setLastEvent(`ws closed code=${ev.code}${ev.reason ? ` reason="${ev.reason}"` : ""}`);
        if (stoppedRef.current) return;
        // Server closed before we explicitly stopped — surface as error so
        // the user sees what code Google sent back (1000=normal, 1006=abnormal,
        // 1008=policy violation, 4xxx=app-level).
        if (ev.code !== 1000) {
          setError(`ws_closed:${ev.code}${ev.reason ? ` ${ev.reason}` : ""}`);
          setStatus("error");
          return;
        }
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

        // Diagnostic: log shape of the first few inbound messages so we
        // can see EXACTLY what Google sends (audio chunks vs transcript-only,
        // tool calls, etc). Capped at 5 to avoid flooding the console.
        if (debugSeenRef.current < 5) {
          debugSeenRef.current += 1;
          try {
            console.log(`[live#${debugSeenRef.current}]`, JSON.stringify(msg).slice(0, 800));
          } catch {
            /* ignore */
          }
        }

        // Tool call relay — model fires functionCalls, we POST each to our
        // server (which runs the same execTool chat uses), then send the
        // result back so the model can keep talking with the data in hand.
        const toolCall = msg.toolCall as
          | { functionCalls?: { id?: string; name?: string; args?: Record<string, unknown> }[] }
          | undefined;
        if (toolCall?.functionCalls?.length) {
          setLastEvent(`tool: ${toolCall.functionCalls.map((f) => f.name).join(", ")}`);
          const responses = await Promise.all(
            toolCall.functionCalls.map(async (fc) => {
              const name = fc.name || "";
              try {
                const r = await authFetch("/api/llm?action=tool-exec", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name,
                    args: fc.args ?? {},
                    brain_id: brainIdRef.current,
                  }),
                });
                const data = await r.json().catch(() => ({}));
                const result = (data as { result?: unknown }).result ?? {
                  error: `tool-exec HTTP ${r.status}`,
                };
                return { id: fc.id, name, response: { result } };
              } catch (e) {
                return {
                  id: fc.id,
                  name,
                  response: { result: { error: e instanceof Error ? e.message : "relay_failed" } },
                };
              }
            }),
          );
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
          }
          return;
        }

        if (msg.setupComplete) {
          setLastEvent("setupComplete — streaming mic");
          // Setup acknowledged — wire mic worklet and start streaming.
          const source = audioCtx.createMediaStreamSource(stream);
          sourceRef.current = source;
          const node = new AudioWorkletNode(audioCtx, "pcm-recorder");
          micNodeRef.current = node;
          node.port.onmessage = (e) => {
            if (!(e.data instanceof ArrayBuffer)) return;
            const b64 = int16ToBase64(e.data);
            const open = wsRef.current?.readyState === WebSocket.OPEN;
            if (!open) return;
            // Google deprecated realtimeInput.mediaChunks (close code 1007).
            // New shape is realtimeInput.audio (single Blob, not an array).
            wsRef.current?.send(
              JSON.stringify({
                realtimeInput: {
                  audio: { mimeType: "audio/pcm;rate=16000", data: b64 },
                },
              }),
            );
            chunksOutRef.current += 1;
            // Throttle setState to every 10 chunks (~1s) to avoid re-render storm.
            if (chunksOutRef.current % 10 === 0) setChunksOut(chunksOutRef.current);
          };
          source.connect(node);
          // Don't connect to destination — we don't want mic monitoring.
          setStatus("listening");
          return;
        }

        chunksInRef.current += 1;
        if (chunksInRef.current % 5 === 0) setChunksIn(chunksInRef.current);

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
          // AudioBuffer is created at the source rate (24 kHz); the context
          // resamples to its own rate when the source node plays.
          const f32 = base64ToFloat32(data);
          const buf = audioCtx.createBuffer(1, f32.length, cfg.outputSampleRate);
          buf.getChannelData(0).set(f32);
          const src = audioCtx.createBufferSource();
          src.buffer = buf;
          src.connect(audioCtx.destination);
          const startAt = Math.max(nextPlayTimeRef.current, audioCtx.currentTime);
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

  const prewarm = useCallback(async (opts: StartOpts) => {
    // No-op if we already have a fresh cached token for the same key.
    if (
      cachedConfig &&
      cachedConfig.key === cacheKey(opts) &&
      Date.now() - cachedConfig.mintedAt < TOKEN_TTL_MS
    ) {
      return;
    }
    // Warm the worklet HTTP cache in parallel with the token mint —
    // addModule() in start() will then pull from cache instead of
    // network. Failure here is non-fatal (start will fetch on demand).
    fetch("/audio-worklets/pcm-recorder.js", { credentials: "same-origin" }).catch(() => {});
    try {
      const r = await authFetch("/api/llm?action=live-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice: opts.voice,
          brain_id: opts.brainId,
          systemInstruction: opts.systemInstruction,
        }),
      });
      if (!r.ok) return;
      const cfg = (await r.json()) as SessionConfig;
      cachedConfig = { cfg, key: cacheKey(opts), mintedAt: Date.now() };
    } catch {
      // Pre-warm failures silently fall through to a cold start.
    }
  }, []);

  return {
    status,
    error,
    userTranscript,
    assistantTranscript,
    lastEvent,
    chunksOut,
    chunksIn,
    closeCode,
    closeReason,
    start,
    stop,
    prewarm,
  };
}
