import BulkImportPanel from "./BulkImportPanel";
import { parseEvernote } from "../../lib/imports/evernote";

export default function EvernoteImportPanel({ brainId }: { brainId: string }) {
  return (
    <BulkImportPanel
      brainId={brainId}
      source="evernote"
      label="Evernote"
      accept=".enex"
      parser={parseEvernote}
      description={
        <>
          In Evernote, select notes (or a notebook) →{" "}
          <em>File / Export Notes…</em> → choose{" "}
          <strong style={{ fontStyle: "normal", color: "var(--ink-soft)" }}>
            ENEX (.enex)
          </strong>
          . Drop the file here. Note titles, tags, dates, and rich-text content are
          preserved (HTML is converted to plain text). Attachment filenames are recorded
          but binary attachments stay in the source export.
        </>
      }
    />
  );
}
