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
