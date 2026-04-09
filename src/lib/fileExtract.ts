import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it: any) => it.str).join(" "));
  }
  return pages.join("\n\n");
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const mod = await import("mammoth");
  // Handle CJS default interop
  const mammoth = (mod as any).default ?? mod;
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

async function extractExcel(buffer: ArrayBuffer): Promise<string> {
  const mod = await import("xlsx");
  // Handle CJS default interop
  const XLSX = (mod as any).default ?? mod;
  const wb = XLSX.read(buffer, { type: "array" });
  return (wb.SheetNames as string[]).map((name) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    return `[Sheet: ${name}]\n${csv}`;
  }).join("\n\n");
}

export async function extractTextFromFile(file: File): Promise<string> {
  // Yield to allow React to flush loading state before heavy work
  await new Promise((r) => setTimeout(r, 0));

  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (name.endsWith(".pdf")) return extractPdf(buffer);
  if (name.endsWith(".docx")) return extractDocx(buffer);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return extractExcel(buffer);
  return new TextDecoder().decode(buffer);
}
