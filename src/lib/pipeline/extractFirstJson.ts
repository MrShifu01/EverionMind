export function extractFirstJson(raw: string): unknown | null {
  const stripped = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");

  const fullMatch = stripped.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (fullMatch) {
    try {
      return JSON.parse(fullMatch[0]);
    } catch { /* fall through */ }
  }

  const start = stripped.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === "{") depth++;
    else if (stripped[i] === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(stripped.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}
