// Wrapper around `vite build` that filters one upstream noise line.
//
// vite-plugin-pwa@1.2.0 (latest at time of writing) calls Vite a second time
// internally to build the service worker, and that child build sets
// `inlineDynamicImports: true` — which Rolldown deprecated in favour of
// `codeSplitting: false`. The deprecation fires on every build, our config
// can't reach the child build's config, and we ship on top of Vercel's
// build output so cleaner logs are worth the indirection.
//
// Filter is anchored on the unique deprecation phrase so unrelated warnings
// pass through. Exit code is preserved verbatim so CI still fails when the
// build fails.

import { spawn } from "node:child_process";

// ANSI-stripped match — Rolldown wraps the option name in colour codes
// (e.g. "\x1b[36minlineDynamicImports\x1b[39m"), so a plain phrase regex
// would miss the line. Strip CSI sequences before testing.
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function isNoise(line) {
  const clean = line.replace(ANSI_RE, "");
  return /inlineDynamicImports option is deprecated/.test(clean);
}

function pipeFiltered(source, sink) {
  let buffer = "";
  source.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    // Keep the trailing partial line for the next chunk.
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!isNoise(line)) sink.write(line + "\n");
    }
  });
  source.on("end", () => {
    if (buffer && !isNoise(buffer)) sink.write(buffer);
  });
}

const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: ["inherit", "pipe", "pipe"],
});

pipeFiltered(child.stdout, process.stdout);
pipeFiltered(child.stderr, process.stderr);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
