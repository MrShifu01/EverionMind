/**
 * File parsing utilities for OpenBrain file upload.
 * Supports:
 *   Text  — .txt .md .csv .tsv .json
 *   Office — .docx (mammoth) | .xlsx .xls .ods (SheetJS)
 *   Finance — .ofx .qfx (SGML/XML read as text)
 *   Binary — .pdf (base64 → Anthropic document API)
 */

export const SUPPORTED_EXTENSIONS = [
  ".txt", ".md", ".csv", ".tsv", ".json",
  ".pdf",
  ".docx",
  ".xlsx", ".xls", ".ods",
  ".ofx", ".qfx",
] as const;

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv", ".tsv", ".json", ".ofx", ".qfx"]);
const EXCEL_EXTENSIONS = new Set([".xlsx", ".xls", ".ods"]);

export const ACCEPT_STRING = [
  ".txt,.md,.csv,.tsv,.json",
  ".pdf",
  ".docx",
  ".xlsx,.xls,.ods",
  ".ofx,.qfx",
  "text/plain,text/markdown,text/csv,text/tab-separated-values,application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.oasis.opendocument.spreadsheet",
].join(",");

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return "";
  return filename.slice(dot).toLowerCase();
}

export function isSupportedFile(file: File): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(getFileExtension(file.name));
}

export function isTextFile(file: File): boolean {
  return TEXT_EXTENSIONS.has(getFileExtension(file.name));
}

export function isDocxFile(file: File): boolean {
  return getFileExtension(file.name) === ".docx";
}

export function isExcelFile(file: File): boolean {
  return EXCEL_EXTENSIONS.has(getFileExtension(file.name));
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Extract plain text from a .docx file using mammoth. */
export async function readDocxFile(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

/**
 * Convert Excel/ODS workbook to plain text using SheetJS.
 * Each sheet becomes a section; cells are tab-separated, rows newline-separated.
 */
export async function readExcelFile(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t" });
    const trimmed = csv
      .split("\n")
      .map((r) => r.trimEnd())
      .filter((r) => r.replace(/\t/g, "").trim()) // skip blank rows
      .join("\n");
    if (trimmed) parts.push(`Sheet: ${sheetName}\n${trimmed}`);
  }
  return parts.join("\n\n");
}

export function isCsvFile(file: File): boolean {
  return getFileExtension(file.name) === ".csv";
}

export interface CsvTransaction {
  date: string;
  description: string;
  amount: string;
  balance?: string;
  raw: string;
}

/**
 * Parse a CSV bank statement into transactions.
 * Tries to auto-detect common formats (date, description, amount columns).
 */
export function parseCsvTransactions(csvText: string): CsvTransaction[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0].toLowerCase();
  const hasHeader = /date|description|amount|debit|credit|balance|transaction/i.test(headerLine);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headerFields = hasHeader ? parseRow(lines[0]) : [];

  let dateCol = -1;
  let descCol = -1;
  let amountCol = -1;
  let balanceCol = -1;

  if (hasHeader) {
    headerFields.forEach((h, i) => {
      const hl = h.toLowerCase();
      if (dateCol === -1 && /date|posted|transaction.?date/i.test(hl)) dateCol = i;
      if (descCol === -1 && /desc|narr|detail|memo|reference|payee/i.test(hl)) descCol = i;
      if (amountCol === -1 && /amount|debit|value|sum/i.test(hl)) amountCol = i;
      if (balanceCol === -1 && /balance|running/i.test(hl)) balanceCol = i;
    });
  }

  if (dateCol === -1 || descCol === -1 || amountCol === -1) {
    const sample = parseRow(dataLines[0]);
    sample.forEach((val, i) => {
      if (dateCol === -1 && /^\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}$/.test(val)) dateCol = i;
      if (amountCol === -1 && /^-?[\d\s,.]+$/.test(val) && val.replace(/[^\d]/g, "").length >= 2) {
        if (dateCol !== i) amountCol = i;
      }
    });
    if (descCol === -1) {
      let maxLen = 0;
      sample.forEach((val, i) => {
        if (i !== dateCol && i !== amountCol && i !== balanceCol && val.length > maxLen) {
          maxLen = val.length;
          descCol = i;
        }
      });
    }
  }

  if (dateCol === -1 && descCol === -1 && amountCol === -1) return [];

  const transactions: CsvTransaction[] = [];
  for (const line of dataLines) {
    if (!line.trim()) continue;
    const fields = parseRow(line);
    const date = dateCol >= 0 && fields[dateCol] ? fields[dateCol] : "";
    const description = descCol >= 0 && fields[descCol] ? fields[descCol] : fields.join(" ");
    const amount = amountCol >= 0 && fields[amountCol] ? fields[amountCol] : "";
    const balance = balanceCol >= 0 && fields[balanceCol] ? fields[balanceCol] : undefined;

    if (!description.trim() && !amount.trim()) continue;

    transactions.push({
      date,
      description: description.trim(),
      amount: amount.replace(/[^\d.,-]/g, ""),
      balance: balance?.replace(/[^\d.,-]/g, ""),
      raw: line,
    });
  }

  return transactions;
}
