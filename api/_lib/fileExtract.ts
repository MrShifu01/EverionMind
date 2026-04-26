/**
 * Server-side text extraction for uploaded files.
 *
 * Goal: never burn a Gemini call on a format we can parse natively. The
 * dispatch picks a free/fast local parser per file type and only signals
 * "fall back to vision" (returns null) when the format genuinely needs an
 * LLM — images and scanned PDFs.
 *
 * Each parser is lazy-imported so cold start cost is paid only when that
 * format is actually uploaded.
 */

export type ExtractSource =
  | "pdfjs"
  | "mammoth"
  | "exceljs"
  | "text"
  | "html"
  | "csv";

export interface ExtractResult {
  text: string;
  source: ExtractSource;
}

/**
 * Try every local parser. Returns null when no local path applies — caller
 * decides whether to escalate to Gemini (images, scanned PDFs, unknown
 * binaries) or surface an error.
 */
export async function extractFromBuffer(
  buffer: Buffer,
  mimeType: string,
  filename = "",
): Promise<ExtractResult | null> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const mt = mimeType.toLowerCase();

  // ── PDF ──
  if (mt === "application/pdf" || ext === "pdf") {
    const text = await extractPdf(buffer);
    return text.trim().length > 100 ? { text, source: "pdfjs" } : null;
  }

  // ── DOCX (Word, modern) ──
  if (
    ext === "docx" ||
    mt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const text = await extractDocx(buffer);
    return { text, source: "mammoth" };
  }

  // ── XLSX / XLS (Excel) ──
  if (
    ext === "xlsx" ||
    ext === "xls" ||
    mt === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mt === "application/vnd.ms-excel"
  ) {
    const text = await extractExcel(buffer);
    return { text, source: "exceljs" };
  }

  // ── CSV / TSV ──
  if (ext === "csv" || ext === "tsv" || mt === "text/csv" || mt === "text/tab-separated-values") {
    return { text: buffer.toString("utf-8"), source: "csv" };
  }

  // ── HTML (strip tags, keep readable prose) ──
  if (ext === "html" || ext === "htm" || mt === "text/html") {
    return { text: stripHtml(buffer.toString("utf-8")), source: "html" };
  }

  // ── Plain-text family ──
  // Includes: txt, md, markdown, json, log, xml, yml/yaml, ts/js source, etc.
  // Any text/* MIME plus a small set of common dev/data extensions.
  if (
    mt.startsWith("text/") ||
    mt === "application/json" ||
    mt === "application/xml" ||
    /^(txt|md|markdown|json|log|xml|yml|yaml|js|ts|tsx|jsx|css|scss|sql|sh|py|go|rs|rb|java|c|cc|cpp|h|hpp)$/.test(ext)
  ) {
    return { text: buffer.toString("utf-8"), source: "text" };
  }

  // Unknown / image / audio — caller handles (typically Gemini vision).
  return null;
}

// ── Implementations ────────────────────────────────────────────────────────

async function extractPdf(buffer: Buffer): Promise<string> {
  try {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = (content.items as Array<{ str?: string }>).map((it) => it.str ?? "").join(" ");
      if (text.trim()) pages.push(text.trim());
    }
    return pages.join("\n\n");
  } catch (e: any) {
    console.warn("[extract:pdf]", e?.message || e);
    return "";
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth: any = (await import("mammoth")).default ?? (await import("mammoth"));
    // mammoth accepts a Node Buffer via the `buffer` key.
    const result = await mammoth.extractRawText({ buffer });
    return String(result.value ?? "").trim();
  } catch (e: any) {
    console.warn("[extract:docx]", e?.message || e);
    return "";
  }
}

async function extractExcel(buffer: Buffer): Promise<string> {
  try {
    const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const out: string[] = [];
    wb.eachSheet((sheet: any) => {
      out.push(`=== ${sheet.name} ===`);
      sheet.eachRow({ includeEmpty: false }, (row: any) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell: any) => {
          const v = cell.value;
          let s: string;
          if (v == null) s = "";
          else if (typeof v === "object" && "text" in v) s = String(v.text ?? "");
          else if (typeof v === "object" && "richText" in v) s = (v.richText as Array<{ text: string }>).map((r) => r.text).join("");
          else if (v instanceof Date) s = v.toISOString();
          else s = String(v);
          cells.push(s.replace(/\t/g, " "));
        });
        out.push(cells.join("\t"));
      });
      out.push("");
    });
    return out.join("\n").trim();
  } catch (e: any) {
    console.warn("[extract:xlsx]", e?.message || e);
    return "";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(?:p|div|br|li|tr|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
