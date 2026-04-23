import { useCallback, useEffect, useState } from "react";
import { aiSettings, type AISettingsPatch, type AISnapshot } from "../lib/aiSettings";

export function useAISettings(): {
  settings: AISnapshot;
  isLoaded: boolean;
  save: (patch: AISettingsPatch) => Promise<{ error: string | null }>;
} {
  const [settings, setSettings] = useState<AISnapshot>(() => aiSettings.get());

  useEffect(() => {
    const refresh = () => setSettings(aiSettings.get());
    window.addEventListener("aiSettingsLoaded", refresh);
    return () => window.removeEventListener("aiSettingsLoaded", refresh);
  }, []);

  const save = useCallback(async (patch: AISettingsPatch) => {
    const result = await aiSettings.set(patch);
    if (!result.error) setSettings(aiSettings.get());
    return result;
  }, []);

  return { settings, isLoaded: settings.isLoaded, save };
}
