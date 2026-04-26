export interface ParsedContact {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phones: string[];
  emails: string[];
  company?: string;
  title?: string;
  notes?: string;
  addresses?: string[];
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return `+${digits}`;
  // SA local: 0XX → +27XX
  if (digits.startsWith("0") && digits.length === 10) return `+27${digits.slice(1)}`;
  // Already has country code 27
  if (digits.startsWith("27") && digits.length === 11) return `+${digits}`;
  // Fallback: return cleaned
  return digits.length >= 7 ? `+${digits}` : raw;
}

function unfoldLines(raw: string): string[] {
  // RFC 6350 line folding: continuation lines start with SPACE or TAB
  return raw.split(/\r?\n/).reduce((acc: string[], line) => {
    if ((line.startsWith(" ") || line.startsWith("\t")) && acc.length > 0) {
      acc[acc.length - 1] += line.slice(1);
    } else {
      acc.push(line);
    }
    return acc;
  }, []);
}

function getValues(lines: string[], key: string): string[] {
  const re = new RegExp(`^${key}(?:[;:])`, "i");
  return lines
    .filter((l) => re.test(l))
    .map((l) => l.replace(/^[^:]+:/, "").trim())
    .filter(Boolean);
}

export function parseVCF(text: string): ParsedContact[] {
  const contacts: ParsedContact[] = [];
  const seenIds = new Set<string>();
  const seenPhones = new Set<string>();

  // Split into individual vCard blocks
  const blocks = text
    .split(/(?=BEGIN:VCARD)/i)
    .map((b) => b.trim())
    .filter((b) => /BEGIN:VCARD/i.test(b));

  for (const block of blocks) {
    const lines = unfoldLines(block);

    const fn = getValues(lines, "FN")[0] ?? "";
    if (!fn.trim()) continue;

    // N field: LAST;FIRST;MIDDLE;PREFIX;SUFFIX
    const nParts = (getValues(lines, "N")[0] ?? "").split(";");
    const lastName = nParts[0]?.trim() || "";
    const firstName = nParts[1]?.trim() || "";

    const phones = lines
      .filter((l) => /^TEL/i.test(l))
      .map((l) => l.replace(/^[^:]+:/, "").trim())
      .filter(Boolean)
      .map(normalizePhone);

    const emails = lines
      .filter((l) => /^EMAIL/i.test(l))
      .map((l) =>
        l
          .replace(/^[^:]+:/, "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);

    // ORG can be "Company;Department"
    const org = (getValues(lines, "ORG")[0] ?? "").split(";")[0].trim() || undefined;
    const jobTitle = getValues(lines, "TITLE")[0]?.trim() || undefined;

    // NOTE: unescape \n and \,
    const noteRaw = getValues(lines, "NOTE")[0] ?? "";
    const notes =
      noteRaw.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").trim() || undefined;

    // ADR: PO;EXT;STREET;CITY;REGION;POSTAL;COUNTRY
    const addresses = lines
      .filter((l) => /^ADR/i.test(l))
      .map((l) =>
        l
          .replace(/^[^:]+:/, "")
          .split(";")
          .map((p) => p.trim())
          .filter(Boolean)
          .join(", "),
      )
      .filter(Boolean);

    // Generate unique slug
    let baseId = slugify(fn) || "contact";
    let id = baseId;
    let n = 2;
    while (seenIds.has(id)) id = `${baseId}_${n++}`;
    seenIds.add(id);

    // Deduplicate by primary phone
    if (phones.length > 0 && seenPhones.has(phones[0])) continue;
    if (phones.length > 0) seenPhones.add(phones[0]);

    contacts.push({
      id,
      name: fn.trim(),
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      phones,
      emails,
      company: org,
      title: jobTitle,
      notes,
      addresses: addresses.length ? addresses : undefined,
    });
  }

  return contacts;
}
