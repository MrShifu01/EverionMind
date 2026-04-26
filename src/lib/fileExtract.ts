import { authFetch } from "./authFetch";

async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Resize + JPEG-compress images before upload so they stay under Vercel's
// 4.5 MB function payload limit. Phone photos are often 3–8 MB raw; at
// 1024px / q0.82 they drop to ~150–400 KB with no loss in OCR accuracy.
async function compressImage(file: File, maxDim = 1024, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function extractViaAI(file: File): Promise<string> {
  const toSend = file.type.startsWith("image/") ? await compressImage(file) : file;
  const fileData = await fileToBase64(toSend);
  const mimeType = toSend.type || file.type;
  // The server now dispatches by filename + mimeType so the same endpoint
  // handles images (Gemini), scanned PDFs (Gemini), and anything else local
  // parsers can do (DOCX, XLSX, CSV, text). Sending filename lets it pick.
  const res = await authFetch("/api/extract-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      fileData,
      mimeType,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.text || "";
}

async function extractXlsx(buffer: ArrayBuffer): Promise<string> {
  const mod = await import("exceljs");
  const ExcelJS = (mod as any).default ?? mod;
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
        else if (typeof v === "object" && "richText" in v)
          s = (v.richText as Array<{ text: string }>).map((r) => r.text).join("");
        else if (v instanceof Date) s = v.toISOString();
        else s = String(v);
        cells.push(s.replace(/\t/g, " "));
      });
      out.push(cells.join("\t"));
    });
    out.push("");
  });
  return out.join("\n").trim();
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

async function extractPDF(buffer: ArrayBuffer): Promise<string> {
  const mod = await import("pdfjs-dist");
  const pdfjsLib = (mod as any).default ?? mod;
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url,
    ).href;
  }
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(" ");
    if (text.trim()) pages.push(text.trim());
  }
  return pages.join("\n\n");
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const mod = await import("mammoth");
  const mammoth = (mod as any).default ?? mod;
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

export async function extractTextFromFile(file: File): Promise<string> {
  await new Promise((r) => setTimeout(r, 0));
  const name = file.name.toLowerCase();

  // Images: only Gemini vision can OCR. Everything else has a local path.
  if (file.type.startsWith("image/")) {
    return extractViaAI(file);
  }

  const buffer = await file.arrayBuffer();

  // Excel — local exceljs parse preserves rows/columns as TSV-like text.
  // Was hitting Gemini before, which truncated and lost structure.
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    try {
      const text = await extractXlsx(buffer);
      if (text.trim()) return text;
    } catch {
      // fall through to Gemini if exceljs can't read it (e.g. legacy .xls)
    }
    return extractViaAI(file);
  }

  // PDF — pdfjs first; Gemini if no text layer (scanned/image-only).
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      const text = await extractPDF(buffer);
      if (text.trim()) return text;
    } catch {
      // pdfjs failed — fall through to AI extraction
    }
    return extractViaAI(file);
  }

  // DOCX — mammoth is local and reliable.
  if (name.endsWith(".docx")) return extractDocx(buffer);

  // HTML — strip tags, keep readable prose. Raw HTML markup pollutes the
  // entry content and is almost never what the user wanted.
  if (name.endsWith(".html") || name.endsWith(".htm") || file.type === "text/html") {
    return stripHtml(new TextDecoder().decode(buffer));
  }

  // Plain-text family (txt, md, json, csv, code, etc.) — direct decode.
  return new TextDecoder().decode(buffer);
}
