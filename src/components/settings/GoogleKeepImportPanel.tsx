import BulkImportPanel from "./BulkImportPanel";
import { parseGoogleKeep } from "../../lib/imports/google-keep";

export default function GoogleKeepImportPanel({ brainId }: { brainId: string }) {
  return (
    <BulkImportPanel
      brainId={brainId}
      source="google_keep"
      label="Google Keep"
      accept=".zip,.json"
      parser={parseGoogleKeep}
      allowDirectory
      description={
        <>
          Upload a Google Takeout{" "}
          <strong style={{ fontStyle: "normal", color: "var(--ink-soft)" }}>.zip</strong>,
          individual Keep{" "}
          <strong style={{ fontStyle: "normal", color: "var(--ink-soft)" }}>.json</strong> files, or
          pick the unzipped{" "}
          <strong style={{ fontStyle: "normal", color: "var(--ink-soft)" }}>Keep/</strong> folder.
          Trashed notes are skipped. Re-importing the same data is safe — duplicates are dropped on
          the server.
        </>
      }
    />
  );
}
