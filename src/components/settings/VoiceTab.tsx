import SettingsRow, { SettingsToggle } from "./SettingsRow";
import { useVoiceMode } from "../../hooks/useVoiceMode";

export default function VoiceTab() {
  const [mode, setMode] = useVoiceMode();
  const isAuto = mode === "auto";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <SettingsRow
        label="Auto-save voice captures"
        hint="When on, holding the home orb records, transcribes, and saves straight to your brain — no review modal. When off, voice opens the capture sheet for review first."
        last
      >
        <SettingsToggle
          value={isAuto}
          onChange={(v) => setMode(v ? "auto" : "preview")}
          ariaLabel="Auto-save voice captures"
        />
      </SettingsRow>
    </div>
  );
}
