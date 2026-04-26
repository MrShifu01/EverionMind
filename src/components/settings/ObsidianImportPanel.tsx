import BulkImportPanel from "./BulkImportPanel";
import { parseObsidian } from "../../lib/imports/obsidian";

export default function ObsidianImportPanel({ brainId }: { brainId: string }) {
  return (
    <BulkImportPanel
      brainId={brainId}
      source="obsidian"
      label="Obsidian"
      accept=".zip,.md"
      parser={parseObsidian}
      description={
        <>
          Zip your Obsidian vault and drop it in, or upload individual{" "}
          <strong style={{ fontStyle: "normal", color: "var(--ink-soft)" }}>.md</strong> files.
          YAML frontmatter and inline #tags are preserved.
        </>
      }
    />
  );
}
