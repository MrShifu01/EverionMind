import { useEffect, useState } from "react";

export type VoiceMode = "preview" | "auto";

const KEY = "everion_voice_mode.v1";
const DEFAULT: VoiceMode = "preview";

function read(): VoiceMode {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === "auto" || raw === "preview" ? raw : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function useVoiceMode(): [VoiceMode, (m: VoiceMode) => void] {
  const [mode, setMode] = useState<VoiceMode>(() => read());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== KEY) return;
      setMode(read());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function set(next: VoiceMode) {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    setMode(next);
  }

  return [mode, set];
}

// ── Gemini Live: native-audio dialog voice ─────────────────────────────────
// Server-side: requires GEMINI_LIVE_MODEL env var on Vercel (e.g.
// "gemini-3.1-flash-live"). Off by default — user opts in from Settings →
// Voice.

const LIVE_KEY = "everion_gemini_live.v1";

function readLive(): boolean {
  try {
    return localStorage.getItem(LIVE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useGeminiLive(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => readLive());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== LIVE_KEY) return;
      setOn(readLive());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function set(next: boolean) {
    try {
      localStorage.setItem(LIVE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    setOn(next);
  }

  return [on, set];
}

// ── Gemini Live voice picker ───────────────────────────────────────────────
// Gemini Live exposes a fixed roster of named voices. List mirrors the
// official Gemini docs as of 2026-05; server validates against env-allowed
// names so unknown picks fall back gracefully.

export type GeminiVoice =
  | "Aoede"
  | "Charon"
  | "Fenrir"
  | "Kore"
  | "Puck"
  | "Leda"
  | "Orus"
  | "Zephyr";

export const GEMINI_VOICES: { id: GeminiVoice; tag: string }[] = [
  { id: "Aoede", tag: "warm, conversational female" },
  { id: "Kore", tag: "bright, young female" },
  { id: "Leda", tag: "smooth, neutral female" },
  { id: "Zephyr", tag: "airy, calm female" },
  { id: "Charon", tag: "deep, narrative male" },
  { id: "Fenrir", tag: "energetic, mature male" },
  { id: "Puck", tag: "energetic, young male" },
  { id: "Orus", tag: "smooth, neutral male" },
];

const VOICE_KEY = "everion_gemini_voice.v1";
const DEFAULT_VOICE: GeminiVoice = "Aoede";

function readVoice(): GeminiVoice {
  try {
    const raw = localStorage.getItem(VOICE_KEY) as GeminiVoice | null;
    return raw && GEMINI_VOICES.some((v) => v.id === raw) ? raw : DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

export function useGeminiVoice(): [GeminiVoice, (v: GeminiVoice) => void] {
  const [voice, setVoice] = useState<GeminiVoice>(() => readVoice());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== VOICE_KEY) return;
      setVoice(readVoice());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function set(next: GeminiVoice) {
    try {
      localStorage.setItem(VOICE_KEY, next);
    } catch {
      /* ignore */
    }
    setVoice(next);
  }

  return [voice, set];
}
