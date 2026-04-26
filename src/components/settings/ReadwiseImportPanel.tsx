import BulkImportPanel from "./BulkImportPanel";
import { parseReadwise } from "../../lib/imports/readwise";

export default function ReadwiseImportPanel({ brainId }: { brainId: string }) {
  return (
    <BulkImportPanel
      brainId={brainId}
      source="readwise"
      label="Readwise"
      accept=".csv"
      parser={parseReadwise}
      description={
        <>
          From Readwise, go to <em>Export → CSV</em> and download. Drop the file here.
          Highlights are grouped by book/article — one entry per source, with all
          highlights and notes in the body.
        </>
      }
    />
  );
}
