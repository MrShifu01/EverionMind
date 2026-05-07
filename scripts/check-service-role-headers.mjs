import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const apiRoot = join(root, "api");
const allowed = new Set([
  "api/_lib/sbHeaders.ts",
  "api/_lib/oauthState.ts",
]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|js)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const offenders = [];
for (const file of walk(apiRoot)) {
  const rel = relative(root, file).replace(/\\/g, "/");
  if (allowed.has(rel)) continue;
  const text = readFileSync(file, "utf8");
  if (text.includes("process.env.SUPABASE_SERVICE_ROLE_KEY")) {
    offenders.push(rel);
  }
}

if (offenders.length) {
  console.error("Direct SUPABASE_SERVICE_ROLE_KEY reads are blocked. Use api/_lib/sbHeaders.ts.");
  for (const file of offenders) console.error(`- ${file}`);
  process.exit(1);
}
