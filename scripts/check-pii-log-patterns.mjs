import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["api", "src"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
// Heuristic only. Full AST parsing (e.g. @typescript-eslint/parser) is
// recommended for comprehensive raw-PII logging detection.
const PATTERN = /console\.(?:log|info|warn|error)\s*\([\s\S]*?(?:\.email\b|\.name\b|\.phone\b|\.address\b|\b(?:email|name|phone|address)\b)[\s\S]*?\)/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) yield* walk(path);
    else {
      const match = path.match(/\.[^.]+$/);
      const ext = match ? match[0] : "";
      if (EXTENSIONS.has(ext)) yield path;
    }
  }
}

const offenders = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(PATTERN)) {
      const line = content.slice(0, match.index ?? 0).split(/\r?\n/).length;
      offenders.push(`${file}:${line}: ${match[0].trim()}`);
    }
  }
}

if (offenders.length > 0) {
  console.error("Potential raw PII logging detected. Hash/redact before logging:");
  for (const offender of offenders) console.error(`- ${offender}`);
  process.exit(1);
}
