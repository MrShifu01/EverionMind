import { authFetch } from "./authFetch";

async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function extractViaAI(file: File): Promise<string> {
  const fileData = await fileToBase64(file);
  const res = await authFetch("/api/extract-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      fileData,
      mimeType: file.type || (file.name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : file.name.endsWith(".xls") ? "application/vnd.ms-excel" : "application/octet-stream"),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.text || "";
}

async function extractExcel(buffer: ArrayBuffer): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Use tab-separated output — avoids double-quote wrapping that breaks AI JSON generation
    const tsv = XLSX.utils.sheet_to_txt(sheet, { blankrows: false } as any);
    if (tsv.trim()) parts.push(`[Sheet: ${sheetName}]\n${tsv.trim()}`);
  }
  return parts.join("\n\n");
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

  if (file.type.startsWith("image/")) {
    return extractViaAI(file);
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    return extractExcel(buffer);
  }

  const buffer = await file.arrayBuffer();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      const text = await extractPDF(buffer);
      if (text.trim()) return text;
    } catch {
      // pdfjs failed — fall through to AI extraction
    }
    return extractViaAI(file);
  }
  if (name.endsWith(".docx")) return extractDocx(buffer);
  return new TextDecoder().decode(buffer);
}
