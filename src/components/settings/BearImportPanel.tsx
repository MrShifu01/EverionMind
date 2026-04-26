import BulkImportPanel from "./BulkImportPanel";
import { parseBear } from "../../lib/imports/obsidian";

export default function BearImportPanel({ brainId }: { brainId: string }) {
  return (
    <BulkImportPanel
      brainId={brainId}
      source="bear"
      label="Bear"
      accept=".zip,.md"
      parser={parseBear}
      description={
        <>
          From Bear, choose <em>File → Export Notes</em> and pick Markdown. Drop the resulting
          folder (zipped) or individual{" "}
          <strong style={{ fontStyle: "normal", color: "var(--ink-soft)" }}>.md</strong> files
          here. Inline #tags become Everion tags.
        </>
      }
    />
  );
}
