/**
 * File parsing utilities for OpenBrain file upload.
 * Supports: .txt, .md, .csv (text), .pdf (base64 → Anthropic document API), .docx (mammoth → text)
 */

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".csv", ".pdf", ".docx"] as const;

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv"]);

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

export function isDocxFile(file: File): boolean {
  return getFileExtension(file.name) === ".docx";
}

/**
 * Extract plain text from a .docx file using mammoth.
 * Returns the extracted text, or empty string on failure.
 */
export async function readDocxFile(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
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

  // Try to detect header row
  const headerLine = lines[0].toLowerCase();
  const hasHeader = /date|description|amount|debit|credit|balance|transaction/i.test(headerLine);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  // Parse CSV respecting quoted fields
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

  // Try to identify column indices
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

  // Heuristic: if no header detected, guess from first data row
  if (dateCol === -1 || descCol === -1 || amountCol === -1) {
    const sample = parseRow(dataLines[0]);
    sample.forEach((val, i) => {
      if (dateCol === -1 && /^\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}$/.test(val)) dateCol = i;
      if (amountCol === -1 && /^-?[\d\s,.]+$/.test(val) && val.replace(/[^\d]/g, "").length >= 2) {
        // Could be amount — only if looks numeric
        if (dateCol !== i) amountCol = i;
      }
    });
    // Description is typically the longest text field
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

  // If we still can't find columns, return empty — let the normal file split handle it
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
