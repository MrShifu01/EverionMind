import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["api", "src"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
// Heuristic only. Full AST parsing (e.g. @typescript-eslint/parser) is
// recommended for comprehensive raw-PII logging detection.
//
// Match property-access PII fields (.email, .name, .phone, .address) inside
// a single-line console.{log,info,warn,error}(...) call. Single-line scope
// avoids the cross-statement false positives from greedy [\s\S]*? matching
// (any downstream "name"/"email" word in the file matched against the open
// paren of an unrelated console call).
const PATTERN = /console\.(?:log|info|warn|error)\s*\([^)\n]*?\.(?:email|name|phone|address)\b/;

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
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (PATTERN.test(line)) {
        offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      }
    });
  }
}

if (offenders.length > 0) {
  console.error("Potential raw PII logging detected. Hash/redact before logging:");
  for (const offender of offenders) console.error(`- ${offender}`);
  process.exit(1);
}
