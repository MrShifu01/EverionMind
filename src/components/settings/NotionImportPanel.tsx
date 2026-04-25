import BulkImportPanel from "./BulkImportPanel";
import { parseNotion } from "../../lib/imports/notion";

export default function NotionImportPanel({ brainId }: { brainId: string }) {
  return (
    <BulkImportPanel
      brainId={brainId}
      source="notion"
      label="Notion"
      accept=".zip,.md,.csv"
      parser={parseNotion}
      description={
        <>
          From Notion, use <em>Settings → Workspace → Import / Export</em> and choose{" "}
          <strong style={{ fontStyle: "normal", color: "var(--ink-soft)" }}>
            Markdown &amp; CSV
          </strong>
          . Drop the .zip here. Pages become entries; database rows become entries with
          properties as metadata.
        </>
      }
    />
  );
}
